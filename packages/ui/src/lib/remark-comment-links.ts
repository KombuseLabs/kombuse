import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root, Link } from 'mdast'

// Matches #ticketId/c/commentId (e.g. #235/c/901)
const COMMENT_LINK_REGEX = /#(\d+)\/c\/(\d+)\b/g

export function remarkCommentLinks() {
  return function (tree: Root): undefined {
    findAndReplace(tree, [
      [
        COMMENT_LINK_REGEX,
        (_: string, ticketId: string, commentId: string) => {
          const link: Link = {
            type: 'link',
            title: null,
            url: `comment://${ticketId}/${commentId}`,
            children: [{ type: 'text', value: `#${ticketId}/c/${commentId}` }],
          }
          return link
        },
      ],
    ], { ignore: ['link', 'linkReference'] })
  }
}
