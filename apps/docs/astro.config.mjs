import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  integrations: [
    starlight({
      title: 'Kombuse Docs',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/kombuse/kombuse-mono' },
      ],
      sidebar: [
        {
          label: 'User Guide',
          autogenerate: { directory: 'users' },
        },
        {
          label: 'Developers',
          items: [
            {
              label: 'Getting Started',
              autogenerate: { directory: 'developers/getting-started' },
            },
            {
              label: 'Guides',
              autogenerate: { directory: 'developers/guides' },
            },
            {
              label: 'Reference',
              autogenerate: { directory: 'developers/reference' },
            },
          ],
        },
      ],
    }),
  ],
})
