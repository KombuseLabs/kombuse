import { describe, it, expect } from 'vitest'
import { remarkCommentLinks } from '../remark-comment-links'
import type { Root, Paragraph, Link, Text } from 'mdast'

function makeTree(text: string): Root {
  return {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }],
  }
}

function getFirstParagraph(tree: Root): Paragraph {
  return tree.children[0] as Paragraph
}

function runPlugin(text: string): Root {
  const tree = makeTree(text)
  remarkCommentLinks()(tree)
  return tree
}

describe('remarkCommentLinks', () => {
  it('should convert #ticketId/c/commentId to a comment:// link node', () => {
    const tree = runPlugin('#235/c/901')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    const link = paragraph.children[0] as Link
    expect(link.type).toBe('link')
    expect(link.url).toBe('comment://235/901')
    expect((link.children[0] as Text).value).toBe('#235/c/901')
  })

  it('should handle multiple comment links in one paragraph', () => {
    const tree = runPlugin('#10/c/100 and #20/c/200')
    const paragraph = getFirstParagraph(tree)

    const links = paragraph.children.filter((c) => c.type === 'link') as Link[]
    expect(links).toHaveLength(2)
    expect(links[0]!.url).toBe('comment://10/100')
    expect(links[1]!.url).toBe('comment://20/200')
  })

  it('should preserve surrounding text', () => {
    const tree = runPlugin('See #235/c/901 for context')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(3)
    expect((paragraph.children[0] as Text).value).toBe('See ')
    expect((paragraph.children[1] as Link).url).toBe('comment://235/901')
    expect((paragraph.children[2] as Text).value).toBe(' for context')
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
              children: [{ type: 'text', value: '#235/c/901' }],
            },
          ],
        },
      ],
    }
    remarkCommentLinks()(tree)
    const paragraph = getFirstParagraph(tree)

    const link = paragraph.children[0] as Link
    expect(link.url).toBe('http://example.com')
    expect((link.children[0] as Text).value).toBe('#235/c/901')
  })

  it('should not match plain ticket references like #235', () => {
    const tree = runPlugin('#235')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    expect((paragraph.children[0] as Text).value).toBe('#235')
  })

  it('should not match incomplete comment syntax like #235/c/', () => {
    const tree = runPlugin('#235/c/')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    expect((paragraph.children[0] as Text).value).toBe('#235/c/')
  })
})
