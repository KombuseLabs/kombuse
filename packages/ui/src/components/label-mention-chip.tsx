import { useProjectLabels } from '../hooks/use-labels'
import { LabelBadge } from './labels/label-badge'

interface LabelMentionChipProps {
  labelId: number
  labelName: string
  labelSlug?: string | null
  projectId: string
}

export function LabelMentionChip({ labelId, labelName, labelSlug, projectId }: LabelMentionChipProps) {
  const { data: labels } = useProjectLabels(projectId)
  let label = labels?.find((l) => l.id === labelId)
  if (!label && labelSlug) {
    label = labels?.find((l) => l.slug === labelSlug)
  }

  if (!label) {
    return <span className="font-medium text-muted-foreground">~{labelName}</span>
  }

  return <LabelBadge label={label} size="sm" />
}
