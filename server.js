const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const mysql = require('mysql2');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 30000,      // 心跳超时时间延长到 30 秒 (默认 20 秒)
    pingInterval: 10000,     // 心跳间隔保持 10 秒
    transports: ['websocket', 'polling'] // 允许降级轮询
});

// MySQL 数据库连接
const db = mysql.createPool({
    host: '85.137.245.155',
    user: 'root',
    password: 'mysql_GtDSiB',
    database: 'tetris_versus',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: false // 禁用SSL
});

// 创建数据库和表（如果不存在）
function initDatabase() {
    const createDbSql = 'CREATE DATABASE IF NOT EXISTS tetris_versus';
    db.query(createDbSql, (err) => {
        if (err) {
            console.error('数据库创建失败:', err.message);
        } else {
            console.log('✓ 数据库 tetris_versus 创建成功');
        }
    });

    const createSoloTableSql = `
        CREATE TABLE IF NOT EXISTS solo_ranking (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL DEFAULT '匿名者',
            score INT NOT NULL,
            game_date DATE NOT NULL DEFAULT (CURRENT_DATE),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_score (score DESC)
        )
    `;

    const createPvpTableSql = `
        CREATE TABLE IF NOT EXISTS pvp_ranking (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player1_name VARCHAR(50) NOT NULL DEFAULT '匿名者',
            player2_name VARCHAR(50) NOT NULL DEFAULT '匿名者',
            total_score INT NOT NULL,
            game_date DATE NOT NULL DEFAULT (CURRENT_DATE),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_total_score (total_score DESC)
        )
    `;

    db.query(createSoloTableSql, (err) => {
        if (err) {
            console.error('单人排名表创建失败:', err.message);
        } else {
            console.log('✓ 单人排名表 solo_ranking 创建成功');
        }
    });

    db.query(createPvpTableSql, (err) => {
        if (err) {
            console.error('双人排名表创建失败:', err.message);
        } else {
            console.log('✓ 双人排名表 pvp_ranking 创建成功');
        }
    });
}

// 测试数据库连接
function testConnection() {
    db.getConnection((err, connection) => {
        if (err) {
            console.error('✗ 数据库连接失败:', err.message);
            console.error('请检查MySQL密码是否正确');
            process.exit(1);
        } else {
            console.log('✓ 数据库连接成功');
            connection.release();
            initDatabase();
        }
    });
}

testConnection();

// 解析 JSON 请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

// API: 获取 README.md 内容（用于更新日志）
app.get('/api/changelog', (req, res) => {
    const readmePath = path.join(__dirname, 'README.md');
    try {
        const content = fs.readFileSync(readmePath, 'utf-8');
        res.json({ content });
    } catch (e) {
        res.status(500).json({ error: '无法读取更新日志' });
    }
});

// API: 保存单人分数
app.post('/api/save_solo_score', (req, res) => {
    const { username, score, gameDate } = req.body;
    const sql = 'INSERT INTO solo_ranking (username, score, game_date) VALUES (?, ?, ?)';
    db.query(sql, [username || '匿名者', score, gameDate || new Date().toISOString().split('T')[0]], (err) => {
        if (err) {
            console.log('保存单人分数失败:', err.message);
            res.status(500).json({ success: false, error: '保存失败' });
        } else {
            res.json({ success: true });
        }
    });
});

// API: 获取单人排名
app.get('/api/get_solo_ranking', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const offset = (page - 1) * limit;
    
    const sqlCount = 'SELECT COUNT(*) as total FROM solo_ranking';
    const sqlData = 'SELECT username, score, game_date, created_at FROM solo_ranking ORDER BY score DESC LIMIT ? OFFSET ?';
    
    db.query(sqlCount, (err, countResult) => {
        if (err) {
            console.log('获取单人排名失败:', err.message);
            res.status(500).json({ success: false, error: '获取失败' });
            return;
        }
        
        db.query(sqlData, [limit, offset], (err, results) => {
            if (err) {
                console.log('获取单人排名失败:', err.message);
                res.status(500).json({ success: false, error: '获取失败' });
            } else {
                res.json({ success: true, data: results, total: countResult[0].total, page, limit });
            }
        });
    });
});

// API: 保存双人分数
app.post('/api/save_pvp_score', (req, res) => {
    const { player1Name, player2Name, totalScore, gameDate } = req.body;
    const sql = 'INSERT INTO pvp_ranking (player1_name, player2_name, total_score, game_date) VALUES (?, ?, ?, ?)';
    db.query(sql, [player1Name || '匿名者', player2Name || '匿名者', totalScore, gameDate || new Date().toISOString().split('T')[0]], (err) => {
        if (err) {
            console.log('保存双人分数失败:', err.message);
            res.status(500).json({ success: false, error: '保存失败' });
        } else {
            res.json({ success: true });
        }
    });
});

// API: 获取双人排名
app.get('/api/get_pvp_ranking', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const offset = (page - 1) * limit;
    
    const sqlCount = 'SELECT COUNT(*) as total FROM pvp_ranking';
    const sqlData = 'SELECT player1_name, player2_name, total_score, game_date, created_at FROM pvp_ranking ORDER BY total_score DESC LIMIT ? OFFSET ?';
    
    db.query(sqlCount, (err, countResult) => {
        if (err) {
            console.log('获取双人排名失败:', err.message);
            res.status(500).json({ success: false, error: '获取失败' });
            return;
        }
        
        db.query(sqlData, [limit, offset], (err, results) => {
            if (err) {
                console.log('获取双人排名失败:', err.message);
                res.status(500).json({ success: false, error: '获取失败' });
            } else {
                res.json({ success: true, data: results, total: countResult[0].total, page, limit });
            }
        });
    });
});

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