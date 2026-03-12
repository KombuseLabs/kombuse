import { describe, it, expect } from 'vitest'
import { remarkLabelMentions } from '@/lib/remark-label-mentions'
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
  remarkLabelMentions()(tree)
  return tree
}

describe('remarkLabelMentions', () => {
  it('should convert ~[Label Name](id) to a label:// link node', () => {
    const tree = runPlugin('~[Bug](5)')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    const link = paragraph.children[0] as Link
    expect(link.type).toBe('link')
    expect(link.url).toBe('label://5')
    expect((link.children[0] as Text).value).toBe('Bug')
  })

  it('should handle label names with spaces', () => {
    const tree = runPlugin('~[Feature Request](42)')
    const paragraph = getFirstParagraph(tree)

    const link = paragraph.children[0] as Link
    expect(link.url).toBe('label://42')
    expect((link.children[0] as Text).value).toBe('Feature Request')
  })

  it('should handle multiple label mentions in one paragraph', () => {
    const tree = runPlugin('~[Bug](1) and ~[Feature](2)')
    const paragraph = getFirstParagraph(tree)

    const links = paragraph.children.filter((c) => c.type === 'link') as Link[]
    expect(links).toHaveLength(2)
    expect(links[0]!.url).toBe('label://1')
    expect(links[1]!.url).toBe('label://2')
  })

  it('should preserve surrounding text', () => {
    const tree = runPlugin('See ~[Bug](5) for details')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(3)
    expect((paragraph.children[0] as Text).value).toBe('See ')
    expect((paragraph.children[1] as Link).url).toBe('label://5')
    expect((paragraph.children[2] as Text).value).toBe(' for details')
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
              children: [{ type: 'text', value: '~[Bug](5)' }],
            },
          ],
        },
      ],
    }
    remarkLabelMentions()(tree)
    const paragraph = getFirstParagraph(tree)

    // The link content should remain unchanged
    const link = paragraph.children[0] as Link
    expect(link.url).toBe('http://example.com')
    expect((link.children[0] as Text).value).toBe('~[Bug](5)')
  })

  it('should not match incomplete patterns', () => {
    const tree = runPlugin('~[Incomplete')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    expect((paragraph.children[0] as Text).value).toBe('~[Incomplete')
  })

  it('should not match empty label name', () => {
    const tree = runPlugin('~[](5)')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    expect((paragraph.children[0] as Text).value).toBe('~[](5)')
  })

  it('should encode slug in label:// URL when present', () => {
    const tree = runPlugin('~[Bug](5:bug)')
    const paragraph = getFirstParagraph(tree)

    expect(paragraph.children).toHaveLength(1)
    const link = paragraph.children[0] as Link
    expect(link.type).toBe('link')
    expect(link.url).toBe('label://5/bug')
    expect((link.children[0] as Text).value).toBe('Bug')
  })

  it('should handle slugs with hyphens', () => {
    const tree = runPlugin('~[Feature Request](42:feature-request)')
    const paragraph = getFirstParagraph(tree)

    const link = paragraph.children[0] as Link
    expect(link.url).toBe('label://42/feature-request')
    expect((link.children[0] as Text).value).toBe('Feature Request')
  })

  it('should handle mixed slug and no-slug mentions', () => {
    const tree = runPlugin('~[Bug](1:bug) and ~[Feature](2)')
    const paragraph = getFirstParagraph(tree)

    const links = paragraph.children.filter((c) => c.type === 'link') as Link[]
    expect(links).toHaveLength(2)
    expect(links[0]!.url).toBe('label://1/bug')
    expect(links[1]!.url).toBe('label://2')
  })
})
