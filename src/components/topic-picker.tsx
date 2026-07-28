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
  value: string[]
  disabled?: boolean
  onChange: (value: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [draft, setDraft] = useState<string[]>(value)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const needle = normalize(query.trim())
    if (!needle) return options
    return options.filter((option) => normalize(`${displayLabel(option.value)} ${option.value}`).includes(needle))
  }, [options, query])

  const chosenOptions = useMemo(() => options.filter((option) => value.includes(option.value)), [options, value])
  const chosenQuestions = chosenOptions.reduce((sum, option) => sum + option.count, 0)
  const allVisibleSelected = filtered.length > 0 && filtered.every((option) => draft.includes(option.value))

  useEffect(() => {
    if (!open) return
    setDraft(value)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWithoutSaving()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, options])

  function closeWithoutSaving() {
    setDraft(value)
    setQuery('')
    setOpen(false)
  }

  function apply() {
    onChange(draft)
    setQuery('')
    setOpen(false)
  }

  function toggle(next: string) {
    setDraft((current) => current.includes(next) ? current.filter((item) => item !== next) : [...current, next])
  }

  function toggleVisible() {
    const visibleValues = new Set(filtered.map((option) => option.value))
    setDraft((current) => allVisibleSelected
      ? current.filter((item) => !visibleValues.has(item))
      : [...new Set([...current, ...visibleValues])])
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
      toggle(filtered[activeIndex].value)
    }
  }

  const mainLabel = disabled
    ? 'Choisis d’abord une matière'
    : value.length === 0
      ? 'Tous les thèmes'
      : value.length === 1
        ? displayLabel(value[0])
        : `${value.length} thèmes sélectionnés`

  const subLabel = disabled
    ? 'Les thèmes dépendent de la matière'
    : value.length === 0
      ? `${options.length} thèmes disponibles`
      : `${chosenQuestions} question${chosenQuestions > 1 ? 's' : ''} dans la sélection`

  return <div className={styles.root}>
    <button
      type="button"
      className={styles.trigger}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
    >
      <span className={styles.triggerText}><strong>{mainLabel}</strong><span>{subLabel}</span></span>
      {value.length > 1 && <span className={styles.selectedBubble}>{value.length}</span>}
      <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden>⌄</span>
    </button>

    {open && <>
      <button type="button" className={styles.backdrop} aria-label="Fermer la liste des thèmes" onClick={closeWithoutSaving} />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Choisir plusieurs chapitres ou thèmes">
        <div className={styles.panelHeader}>
          <div><strong>Choisir les thèmes</strong><span>Tu peux en sélectionner plusieurs pour composer une série plus longue.</span></div>
          <button type="button" className={styles.closeButton} aria-label="Fermer" onClick={closeWithoutSaving}>×</button>
        </div>
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
        <div className={styles.quickActions}>
          <button type="button" onClick={() => setDraft([])}>Toute la matière</button>
          <button type="button" onClick={toggleVisible}>{allVisibleSelected ? 'Désélectionner les résultats' : 'Sélectionner les résultats'}</button>
        </div>
        <div className={styles.list} role="listbox" aria-multiselectable="true">
          {filtered.map((option, index) => {
            const checked = draft.includes(option.value)
            return <button
              type="button"
              key={option.value}
              className={`${styles.option} ${index === activeIndex ? styles.optionActive : ''} ${checked ? styles.optionSelected : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => toggle(option.value)}
              role="option"
              aria-selected={checked}
            >
              <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`} aria-hidden>{checked ? '✓' : ''}</span>
              <span className={styles.optionMain}><strong>{displayLabel(option.value)}</strong><small>{sectionLabel(option.value)}</small></span>
              <span className={styles.count}>{option.count}</span>
            </button>
          })}
          {!filtered.length && <div className={styles.empty}>Aucun thème ne correspond à « {query} ».</div>}
        </div>
        <div className={styles.footer}>
          <div className={styles.selectionSummary}><strong>{draft.length || 'Tous'}</strong><span>{draft.length ? ` thème${draft.length > 1 ? 's' : ''} sélectionné${draft.length > 1 ? 's' : ''}` : ' les thèmes seront inclus'}</span></div>
          <div className={styles.footerActions}><button type="button" className={styles.cancel} onClick={closeWithoutSaving}>Annuler</button><button type="button" className={styles.apply} onClick={apply}>Appliquer</button></div>
        </div>
      </div>
    </>}
  </div>
}
