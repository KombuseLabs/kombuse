import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root, Link } from 'mdast'

const TICKET_ID_REGEX = /(?<![.\w])#(\d+)\b/g

export interface RemarkTicketLinksOptions {
  projectId: string
}

export function remarkTicketLinks(options: RemarkTicketLinksOptions) {
  return function (tree: Root): undefined {
    findAndReplace(tree, [
      [
        TICKET_ID_REGEX,
        (_: string, ticketId: string) => {
          const link: Link = {
            type: 'link',
            title: null,
            url: `/projects/${options.projectId}/tickets/${ticketId}`,
            children: [{ type: 'text', value: `#${ticketId}` }],
          }
          return link
        },
      ],
    ], { ignore: ['link', 'linkReference', 'code', 'inlineCode'] })
  }
}
