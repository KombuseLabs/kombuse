import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "../base/input"
import { Button } from "../base/button"
import { X, ChevronUp, ChevronDown } from "lucide-react"

function FindBarInner() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [matchInfo, setMatchInfo] = useState({ current: 0, total: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const findApi = window.electron!.findInPage!

  useEffect(() => {
    return findApi.onToggle(() => {
      setIsOpen((prev) => {
        if (!prev) {
          setTimeout(() => inputRef.current?.focus(), 0)
        }
        return !prev
      })
    })
  }, [])

  useEffect(() => {
    return findApi.onResult((result) => {
      if (result.finalUpdate) {
        setMatchInfo({ current: result.activeMatchOrdinal, total: result.matches })
      }
    })
  }, [])

  const handleSearch = useCallback((text: string) => {
    setQuery(text)
    if (text) {
      findApi.find(text)
    } else {
      findApi.stop()
      setMatchInfo({ current: 0, total: 0 })
    }
  }, [])

  const handleNext = useCallback(() => {
    if (query) findApi.findNext(query)
  }, [query])

  const handlePrev = useCallback(() => {
    if (query) findApi.findPrev(query)
  }, [query])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setQuery("")
    setMatchInfo({ current: 0, total: 0 })
    findApi.stop()
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, handleClose])

  if (!isOpen) return null

  return (
    <div className="fixed top-[var(--header-height,2.5rem)] right-4 z-50 flex items-center gap-1 rounded-b-md border border-t-0 bg-background px-2 py-1 shadow-lg">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            e.shiftKey ? handlePrev() : handleNext()
          }
        }}
        placeholder="Find in page..."
        className="h-7 w-48 text-sm"
      />
      {query && (
        <span className="whitespace-nowrap px-1 text-xs text-muted-foreground">
          {matchInfo.total > 0
            ? `${matchInfo.current}/${matchInfo.total}`
            : "No matches"}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={handlePrev}
        aria-label="Previous match"
      >
        <ChevronUp className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={handleNext}
        aria-label="Next match"
      >
        <ChevronDown className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={handleClose}
        aria-label="Close find bar"
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}

export function FindBar() {
  const hasFindInPage =
    typeof window !== "undefined" && !!window.electron?.findInPage
  if (!hasFindInPage) return null
  return <FindBarInner />
}
