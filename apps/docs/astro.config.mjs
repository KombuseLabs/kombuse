import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightBlog from 'starlight-blog'

export default defineConfig({
  integrations: [
    starlight({
      title: 'Kombuse Docs',
      plugins: [starlightBlog()],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/KombuseLabs/kombuse' },
      ],
      sidebar: [
        {
          label: 'User Guide',
          autogenerate: { directory: 'users' },
        },
      ],
    }),
  ],
})
