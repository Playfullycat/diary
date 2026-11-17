import type { MetadataRoute } from 'next';

/** 让手机"添加到主屏幕"时有名字和图标 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '英语日记',
    short_name: '英语日记',
    description: '写英语日记，AI 帮你批改',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf7f2',
    theme_color: '#faf7f2',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
