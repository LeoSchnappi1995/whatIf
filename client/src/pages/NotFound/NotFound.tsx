import React from 'react';

export default function NotFound() {
  return (
    <div style={{ padding: 80, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontSize: 64 }}>🧭</div>
      <h2 style={{ marginTop: 12 }}>页面不存在</h2>
      <p style={{ color: '#888' }}>你访问的页面走丢了</p>
      <a href="/" style={{ display: 'inline-block', marginTop: 16, color: '#3b82f6' }}>返回首页</a>
    </div>
  );
}
