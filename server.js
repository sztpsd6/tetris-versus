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
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }

        if (rooms[roomId].length >= 2) {
            socket.emit('room_full');
            return;
        }

        rooms[roomId].push(socket.id);
        socket.join(roomId);
        socket.roomId = roomId;

        if (rooms[roomId].length === 1) {
            socket.emit('waiting');
        } else if (rooms[roomId].length === 2) {
            io.to(roomId).emit('start_game');
        }
    });

    socket.on('state_update', (state) => {
        if (!socket.roomId) return;
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
            socket.to(socket.roomId).emit('op_disconnected');
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