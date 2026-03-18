import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightBlog from 'starlight-blog'

export default defineConfig({
  redirects: {
    '/': '/guides/getting-started/',
  },
  integrations: [
    starlight({
      title: 'Kombuse Docs',
      favicon: '/favicon.svg',
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'icon',
            href: '/favicon.ico',
            sizes: '32x32',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'icon',
            href: '/favicon-96x96.png',
            sizes: '96x96',
            type: 'image/png',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'apple-touch-icon',
            href: '/apple-touch-icon.png',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'manifest',
            href: '/site.webmanifest',
          },
        },
      ],
      plugins: [starlightBlog()],
      components: {
        Head: './src/components/Head.astro',
      },
      customCss: ['./src/styles/custom.css'],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/KombuseLabs/kombuse' },
      ],
      sidebar: [
        {
          label: 'Guides',
          items: [
            'guides/getting-started',
            {
              label: 'Quickstart',
              autogenerate: { directory: 'guides/quickstart' },
            },
            'guides/claude-code',
            'guides/triage-with-ai',
            'guides/code-review-agent',
            'guides/building-a-plugin',
            'guides/version-control',
          ],
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
})
