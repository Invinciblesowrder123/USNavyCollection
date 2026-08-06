'use strict';

const express = require('express');
const path = require('path');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use('/api', auth.router);

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }
  }
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'US Navy Collection', time: Date.now() }));

/* JSON 解析错误 → 友好 400 */
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: '请求数据格式错误' });
  }
  if (err && (err.type === 'entity.too.large')) {
    return res.status(413).json({ ok: false, error: '请求体过大' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`[USNavyCollection] 服务器已启动: http://localhost:${PORT}`);
});
