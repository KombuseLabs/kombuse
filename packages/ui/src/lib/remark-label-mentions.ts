import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root, Link } from 'mdast'

// Matches ~[Label Name](label-id)
const LABEL_MENTION_REGEX = /~\[([^\]]+)\]\((\d+)\)/g

export function remarkLabelMentions() {
  return function (tree: Root): undefined {
    findAndReplace(tree, [
      [
        LABEL_MENTION_REGEX,
        (_: string, labelName: string, labelId: string) => {
          const link: Link = {
            type: 'link',
            title: null,
            url: `label://${labelId}`,
            children: [{ type: 'text', value: labelName }],
          }
          return link
        },
      ],
    ], { ignore: ['link', 'linkReference'] })
  }
}
