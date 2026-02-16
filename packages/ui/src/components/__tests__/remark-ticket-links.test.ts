import { describe, it, expect } from 'vitest'
import { remarkTicketLinks } from '../../lib/remark-ticket-links'
import type { Root, Paragraph, Link, Text } from 'mdast'

const PROJECT_ID = 'test-project'

function makeTree(text: string): Root {
  return {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }],
  }
}

function makeListTree(text: string): Root {
  return {
    type: 'root',
    children: [
      {
        type: 'list',
        ordered: false,
        children: [
          {
            type: 'listItem',
            children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }],
          },
        ],
      },
    ],
  }
}

function getFirstParagraph(tree: Root): Paragraph {
  return tree.children[0] as Paragraph
}

function getListItemParagraph(tree: Root): Paragraph {
  const list = tree.children[0] as { children: { children: Paragraph[] }[] }
  return list.children[0]!.children[0]!
}

function runPlugin(text: string): Root {
  const tree = makeTree(text)
  remarkTicketLinks({ projectId: PROJECT_ID })(tree)
  return tree
}

function runPluginOnList(text: string): Root {
  const tree = makeListTree(text)
  remarkTicketLinks({ projectId: PROJECT_ID })(tree)
  return tree
}

describe('remarkTicketLinks', () => {
  it('should convert #NNN in a paragraph to a ticket link', () => {
    const tree = runPlugin('#123')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    const link = paragraph.children[0] as Link
    expect(link.type).toBe('link')
    expect(link.url).toBe('/projects/test-project/tickets/123')
    expect((link.children[0] as Text).value).toBe('#123')
  })

  it('should convert #NNN inside a bulleted list item to a ticket link', () => {
    const tree = runPluginOnList('see #410')
    const paragraph = getListItemParagraph(tree)

    const link = paragraph.children.find((c) => c.type === 'link') as Link
    expect(link).toBeDefined()
    expect(link.url).toBe('/projects/test-project/tickets/410')
    expect((link.children[0] as Text).value).toBe('#410')
  })

  it('should convert #NNN inside a numbered list item to a ticket link', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'list',
          ordered: true,
          children: [
            {
              type: 'listItem',
              children: [{ type: 'paragraph', children: [{ type: 'text', value: 'see #410' }] }],
            },
          ],
        },
      ],
    }
    remarkTicketLinks({ projectId: PROJECT_ID })(tree)
    const list = tree.children[0] as { children: { children: Paragraph[] }[] }
    const paragraph = list.children[0]!.children[0]!

    const link = paragraph.children.find((c) => c.type === 'link') as Link
    expect(link).toBeDefined()
    expect(link.url).toBe('/projects/test-project/tickets/410')
  })

  it('should handle multiple ticket references in one node', () => {
    const tree = runPlugin('#10 and #20 and #30')
    const paragraph = getFirstParagraph(tree)

    const links = paragraph.children.filter((c) => c.type === 'link') as Link[]
    expect(links).toHaveLength(3)
    expect(links[0]!.url).toBe('/projects/test-project/tickets/10')
    expect(links[1]!.url).toBe('/projects/test-project/tickets/20')
    expect(links[2]!.url).toBe('/projects/test-project/tickets/30')
  })

  it('should not transform dot-prefixed patterns like 1.#6', () => {
    const tree = runPlugin('1.#6')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    expect((paragraph.children[0] as Text).value).toBe('1.#6')
  })

  it('should not transform word-prefixed patterns like CSS#123', () => {
    const tree = runPlugin('CSS#123')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    expect((paragraph.children[0] as Text).value).toBe('CSS#123')
  })

  it('should not transform inside existing links', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              url: 'http://example.com',
              title: null,
              children: [{ type: 'text', value: '#123' }],
            },
          ],
        },
      ],
    }
    remarkTicketLinks({ projectId: PROJECT_ID })(tree)
    const paragraph = getFirstParagraph(tree)

    const link = paragraph.children[0] as Link
    expect(link.url).toBe('http://example.com')
    expect((link.children[0] as Text).value).toBe('#123')
  })

  it('should leave plain text without ticket references unchanged', () => {
    const tree = runPlugin('No ticket references here')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    expect((paragraph.children[0] as Text).value).toBe('No ticket references here')
  })
})
