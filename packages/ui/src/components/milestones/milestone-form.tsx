"use client"

import { useState } from 'react'
import type { Milestone } from '@kombuse/types'
import { Button } from '@/base/button'
import { Input } from '@/base/input'
import { Textarea } from '@/base/textarea'

interface MilestoneFormProps {
  milestone?: Milestone
  onSubmit: (data: { title: string; description?: string; due_date?: string }) => void | Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

function MilestoneForm({ milestone, onSubmit, onCancel, isLoading }: MilestoneFormProps) {
  const [title, setTitle] = useState(milestone?.title ?? '')
  const [description, setDescription] = useState(milestone?.description ?? '')
  const [dueDate, setDueDate] = useState(milestone?.due_date ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (title.trim()) {
      onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        due_date: dueDate || undefined,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3">
      <div>
        <Input
          placeholder="Milestone title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          className="h-8 text-sm"
        />
      </div>
      <div>
        <Textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-16 text-sm resize-none"
        />
      </div>
      <div>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="h-8 text-sm"
          placeholder="Due date (optional)"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!title.trim() || isLoading}>
          {milestone ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}

export { MilestoneForm }
export type { MilestoneFormProps }
