'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './topic-picker.module.css'

export type TopicOption = {
  value: string
  count: number
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function displayLabel(value: string) {
  return value
    .replace(/^\s*§\s*(\d+)\s*[.:-]\s*/i, '')
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s*,\s*$/, '')
    .trim() || value
}

function sectionLabel(value: string) {
  const match = value.match(/^\s*§\s*(\d+)/i)
  return match ? `Partie ${match[1]}` : 'Thème'
}

export function TopicPicker({
  options,
  value,
  disabled,
  onChange,
}: {
  options: TopicOption[]
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const needle = normalize(query.trim())
    if (!needle) return options
    return options.filter((option) => normalize(`${displayLabel(option.value)} ${option.value}`).includes(needle))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, options])

  function choose(next: string) {
    onChange(next)
    setQuery('')
    setOpen(false)
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(filtered.length - 1, index + 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    }
    if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault()
      choose(filtered[activeIndex].value)
    }
  }

  const selected = options.find((option) => option.value === value)

  return <div className={styles.root}>
    <button
      type="button"
      className={styles.trigger}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
    >
      <span className={styles.triggerText}>
        <strong>{selected ? displayLabel(selected.value) : disabled ? 'Choisis d’abord une matière' : 'Tous les thèmes'}</strong>
        <span>{disabled ? 'Le thème dépend de la matière' : selected ? `${selected.count} question${selected.count > 1 ? 's' : ''}` : `${options.length} thèmes disponibles`}</span>
      </span>
      <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden>⌄</span>
    </button>

    {open && <>
      <button type="button" className={styles.backdrop} aria-label="Fermer la liste des thèmes" onClick={() => setOpen(false)} />
      <div className={styles.panel} role="dialog" aria-label="Choisir un chapitre ou un thème">
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden>⌕</span>
          <input
            ref={inputRef}
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Rechercher un thème…"
            aria-label="Rechercher un chapitre ou un thème"
          />
        </div>
        <div className={styles.list} role="listbox">
          {!query && <button type="button" className={`${styles.option} ${!value ? styles.optionSelected : ''}`} onClick={() => choose('')} role="option" aria-selected={!value}>
            <span className={styles.optionMain}><strong>Tous les thèmes</strong><small>Toute la matière</small></span>
            <span className={styles.count}>{options.reduce((sum, option) => sum + option.count, 0)}</span>
          </button>}
          {filtered.map((option, index) => <button
            type="button"
            key={option.value}
            className={`${styles.option} ${index === activeIndex ? styles.optionActive : ''} ${value === option.value ? styles.optionSelected : ''}`}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(option.value)}
            role="option"
            aria-selected={value === option.value}
          >
            <span className={styles.optionMain}><strong>{displayLabel(option.value)}</strong><small>{sectionLabel(option.value)}</small></span>
            <span className={styles.count}>{option.count}</span>
          </button>)}
          {!filtered.length && <div className={styles.empty}>Aucun thème ne correspond à « {query} ».</div>}
        </div>
        <div className={styles.footer}><span>{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>{value && <button type="button" className={styles.clear} onClick={() => choose('')}>Effacer le filtre</button>}</div>
      </div>
    </>}
  </div>
}
