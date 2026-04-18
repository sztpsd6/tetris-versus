const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 30000,      // 心跳超时时间延长到 30 秒 (默认 20 秒)
    pingInterval: 10000,     // 心跳间隔保持 10 秒
    transports: ['websocket', 'polling'] // 允许降级轮询
});

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    console.log('玩家连接:', socket.id);

    socket.on('join_room', (roomId) => {
        // 安全验证：检查房间号类型和长度
        if (typeof roomId !== 'string' || roomId.length > 32 || roomId.length < 1) {
            socket.emit('error', '无效的房间号');
            return;
        }
        // 清理房间号，只保留字母数字和短横线
        const sanitizedRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '');
        if (!sanitizedRoomId) {
            socket.emit('error', '房间号不能为空');
            return;
        }

        if (!rooms[sanitizedRoomId]) {
            rooms[sanitizedRoomId] = [];
        }

        if (rooms[sanitizedRoomId].length >= 2) {
            socket.emit('room_full');
            return;
        }

        rooms[sanitizedRoomId].push(socket.id);
        socket.join(sanitizedRoomId);
        socket.roomId = sanitizedRoomId;

        if (rooms[sanitizedRoomId].length === 1) {
            socket.emit('waiting');
        } else if (rooms[sanitizedRoomId].length === 2) {
            io.to(sanitizedRoomId).emit('start_game');
        }
    });

    socket.on('state_update', (state) => {
        if (!socket.roomId) return;
        // 数据校验：检查 state 对象的基本结构
        if (!state || typeof state !== 'object') return;

        // 校验 board: 必须是 ROWS×COLS 的二维数组
        const isValidBoard = Array.isArray(state.board) &&
            state.board.length === 20 &&
            state.board.every(row => Array.isArray(row) && row.length === 12);
        if (!isValidBoard) return;

        // 校验 score: 必须是合理的非负整数（上限 9999999）
        if (typeof state.score !== 'number' || state.score < 0 || state.score > 9999999 || !Number.isFinite(state.score)) return;

        // 校验 player: 至少要有 pos 结构
        if (!state.player || !state.player.pos || typeof state.player.pos.x !== 'number' || typeof state.player.pos.y !== 'number') return;

        socket.to(socket.roomId).emit('op_state', state);
    });

    socket.on('attack', (lines) => {
        if (!socket.roomId) return;
        socket.to(socket.roomId).emit('receive_attack', lines);
    });

    socket.on('game_over', () => {
        if (!socket.roomId) return;
        socket.to(socket.roomId).emit('op_game_over');
    });

    socket.on('disconnect', () => {
        console.log('玩家断开:', socket.id);
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId] = rooms[socket.roomId].filter(id => id !== socket.id);
            // 只有当房间里还有人的时候才通知对方掉线
            if (rooms[socket.roomId].length > 0) {
                socket.to(socket.roomId).emit('op_disconnected');
            }
            if (rooms[socket.roomId].length === 0) {
                delete rooms[socket.roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`游戏服务器运行在端口 ${PORT}`);
});