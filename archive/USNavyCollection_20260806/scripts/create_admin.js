'use strict';
/* ============================================================
 * 创建管理员账号（幂等）：admin / admin
 * 用法: npm run admin
 * ============================================================ */

const auth = require('../auth.js');

const r = auth.ensureAdmin('admin', 'admin');
if (r.ok) {
  console.log(`[管理员] ${r.username} ${r.existed ? '已存在，角色已确认为 admin' : '创建成功（role=admin）'}`);
} else {
  console.error('[管理员] 创建失败:', r.error);
  process.exit(1);
}
