import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root, Link } from 'mdast'

// Matches ~[Label Name](label-id) or ~[Label Name](label-id:slug)
const LABEL_MENTION_REGEX = /~\[([^\]]+)\]\((\d+)(?::([a-z0-9_-]+))?\)/g

export function remarkLabelMentions() {
  return function (tree: Root): undefined {
    findAndReplace(tree, [
      [
        LABEL_MENTION_REGEX,
        (_: string, labelName: string, labelId: string, labelSlug?: string) => {
          const link: Link = {
            type: 'link',
            title: null,
            url: labelSlug ? `label://${labelId}/${labelSlug}` : `label://${labelId}`,
            children: [{ type: 'text', value: labelName }],
          }
          return link
        },
      ],
    ], { ignore: ['link', 'linkReference'] })
  }
}
