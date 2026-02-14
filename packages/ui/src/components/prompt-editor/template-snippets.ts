export interface TemplateSnippet {
  label: string
  template: string
}

export interface TemplateSnippetGroup {
  label: string
  snippets: TemplateSnippet[]
}

export const TEMPLATE_ENGINE_NOTE = 'Templating engine: Nunjucks'

export const TEMPLATE_SNIPPET_GROUPS: TemplateSnippetGroup[] = [
  {
    label: 'Conditionals',
    snippets: [
      {
        label: 'if / else',
        template: `{% if condition %}
...
{% else %}
...
{% endif %}`,
      },
    ],
  },
  {
    label: 'Loops',
    snippets: [
      {
        label: 'for',
        template: `{% for item in items %}
...
{% endfor %}`,
      },
    ],
  },
  {
    label: 'Comments',
    snippets: [
      {
        label: 'comment',
        template: '{# comment #}',
      },
    ],
  },
]
