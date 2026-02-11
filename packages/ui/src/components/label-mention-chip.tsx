import { useProjectLabels } from '../hooks/use-labels'
import { LabelBadge } from './labels/label-badge'

interface LabelMentionChipProps {
  labelId: number
  labelName: string
  projectId: string
}

export function LabelMentionChip({ labelId, labelName, projectId }: LabelMentionChipProps) {
  const { data: labels } = useProjectLabels(projectId)
  const label = labels?.find((l) => l.id === labelId)

  if (!label) {
    return <span className="font-medium text-muted-foreground">~{labelName}</span>
  }

  return <LabelBadge label={label} size="sm" />
}
