import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  GetProfileProxyGroupsBaseline,
  GetProfileRulesBaseline,
  SetProfileRulesTemplate,
} from '../api/profile'
import { RULE_TYPE_OPTIONS } from '../constants'
import {
  applyRulesBucketsToMerge,
  parseRuleLine,
  rulesBucketsFromAdvancedYaml,
  rulesBucketsFromMerge,
  rulesBucketsToAdvancedYaml,
  rulesTemplateFromProfile,
  type RuleRow,
} from '../mergeTemplate'
import { MonacoYamlEditor } from '../MonacoYamlEditor'
import '../styles/editors.css'
import {
  Button,
  Dialog,
  Expansion,
  IconButton,
  Select,
  TextField,
} from '../ui/M3'
import { yamlValidationError } from '../utils/yaml'

import type { ProfileModalTarget } from './ProfileMergeModal'

type Mode = 'visual' | 'advanced'
type RuleAppendTarget = 'prepend' | 'append'

// One rule row: type chip, payload, policy underneath, delete on hover.
function RuleLine({
  ruleType,
  content,
  policy,
  pos,
  deleted,
  actionLabel,
  actionIcon,
  onAction,
}: {
  ruleType: string
  content: string
  policy: string
  pos?: RuleAppendTarget
  deleted?: boolean
  actionLabel: string
  actionIcon: 'close' | 'refresh'
  onAction: () => void
}) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: deleted ? 0.5 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
      className="edRule"
      data-deleted={deleted || undefined}
      data-user={pos ? true : undefined}
    >
      <span className="edRuleType">{ruleType}</span>
      <span className="edRuleBody">
        <strong className="edRuleContent" title={content}>
          {content || '—'}
        </strong>
        <span className="edRulePolicy" title={policy}>
          {policy}
          {pos ? <em>{pos}</em> : null}
        </span>
      </span>
      <span className="edRuleAction">
        <IconButton
          icon={actionIcon}
          label={actionLabel}
          size="small"
          onClick={onAction}
        />
      </span>
    </motion.div>
  )
}

export function ProfileRulesModal({
  target,
  profiles,
  proxyGroups,
  onClose,
  onSaved,
  onError,
}: {
  target: ProfileModalTarget | null
  profiles: any[] | undefined
  proxyGroups: any[] | undefined
  onClose: () => void
  onSaved: (banner: string) => void
  onError: (msg: string) => void
}) {
  const { t } = useTranslation()
  const initialRaw = target ? rulesTemplateFromProfile(profiles, target.id) : ''
  const initialBuckets = useMemo(
    () => rulesBucketsFromMerge(initialRaw),
    [initialRaw],
  )

  const [uiMode, setUiMode] = useState<Mode>('visual')
  const [mergeDraft, setMergeDraft] = useState(initialRaw)
  const [advancedDraft, setAdvancedDraft] = useState(() =>
    rulesBucketsToAdvancedYaml(initialBuckets),
  )
  const [rows, setRows] = useState<RuleRow[]>(initialBuckets.prepend)
  const [appendRows, setAppendRows] = useState<RuleRow[]>(initialBuckets.append)
  const [baseline, setBaseline] = useState<string[] | null>(null)
  const [baselineLoading, setBaselineLoading] = useState(target != null)
  const [baselineError, setBaselineError] = useState<string | null>(null)
  const [deletedBaseline, setDeletedBaseline] = useState<string[]>(
    initialBuckets.delete,
  )
  const [search, setSearch] = useState('')
  const [formType, setFormType] = useState('DOMAIN-SUFFIX')
  const [formContent, setFormContent] = useState('')
  const [formPolicy, setFormPolicy] = useState('DIRECT')

  // Policies come from the live core when it runs; otherwise from the
  // profile's own proxy-groups, so rules can target PROXY & co. before the
  // first Connect (an empty list left only DIRECT/REJECT to pick from).
  const [profileGroupNames, setProfileGroupNames] = useState<string[]>([])
  const liveGroupCount = proxyGroups?.length ?? 0
  useEffect(() => {
    if (!target || liveGroupCount > 0) return
    let cancelled = false
    void GetProfileProxyGroupsBaseline(target.id)
      .then((peek) => {
        if (cancelled) return
        const names = (peek?.groups ?? [])
          .map((g: any) => String(g?.name ?? '').trim())
          .filter(Boolean)
        setProfileGroupNames(names)
      })
      .catch(() => {
        // Falls back to the policies used by the baseline rules below.
      })
    return () => {
      cancelled = true
    }
  }, [target, liveGroupCount])

  const policyOptions = useMemo(() => {
    const live = (proxyGroups ?? [])
      .map((g: any) => String(g?.name ?? '').trim())
      .filter(Boolean)
    const fromRules = (baseline ?? []).map((line) => {
      const parts = line.split(',').map((p) => p.trim())
      if (parts[parts.length - 1]?.toLowerCase() === 'no-resolve') parts.pop()
      return parts[parts.length - 1] ?? ''
    })
    const base = ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS']
    const seen = new Set<string>()
    const out: string[] = []
    for (const v of [...live, ...profileGroupNames, ...fromRules, ...base]) {
      if (!v || seen.has(v)) continue
      seen.add(v)
      out.push(v)
    }
    return out
  }, [proxyGroups, profileGroupNames, baseline])

  const advancedYamlErr = useMemo(
    () => yamlValidationError(advancedDraft, true),
    [advancedDraft],
  )

  useEffect(() => {
    if (!target) return
    let cancelled = false
    const id = target.id
    void (async () => {
      try {
        const peek = await GetProfileRulesBaseline(id)
        if (cancelled) return
        if (peek?.lastError) {
          setBaselineError(peek.lastError)
          setBaseline([])
        } else {
          setBaseline(Array.isArray(peek?.rules) ? peek.rules : [])
        }
      } catch (e: any) {
        if (!cancelled) {
          setBaselineError(String(e))
          setBaseline([])
        }
      } finally {
        if (!cancelled) setBaselineLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [target])

  if (!target) return null

  const onSwitchToVisual = () => {
    if (advancedYamlErr) {
      onError(t('ui.profiles.rulesModal.fixYamlBeforeVisual'))
      return
    }
    setUiMode('visual')
    const buckets =
      uiMode === 'advanced'
        ? rulesBucketsFromAdvancedYaml(advancedDraft)
        : rulesBucketsFromMerge(mergeDraft)
    setRows(buckets.prepend)
    setAppendRows(buckets.append)
    setDeletedBaseline(buckets.delete)
  }

  const addRule = (where: RuleAppendTarget) => {
    const content = formContent.trim()
    const needsContent = formType !== 'MATCH'
    if (needsContent && !content) return
    const row: RuleRow = {
      id: `rl-${Date.now()}`,
      ruleType: formType,
      content: needsContent ? content : '',
      policy: formPolicy.trim() || 'DIRECT',
    }
    const prepNext = where === 'prepend' ? [row, ...rows] : rows
    const appNext =
      where === 'append' ? [...appendRows, row] : appendRows
    setRows(prepNext)
    setAppendRows(appNext)
    const buckets = {
      prepend: prepNext,
      append: appNext,
      delete: deletedBaseline,
    }
    setMergeDraft((prev) => applyRulesBucketsToMerge(prev, buckets))
    setAdvancedDraft(rulesBucketsToAdvancedYaml(buckets))
    setFormContent('')
  }

  const removeRow = (rowId: string) => {
    const next = rows.filter((x) => x.id !== rowId)
    setRows(next)
    const buckets = {
      prepend: next,
      append: appendRows,
      delete: deletedBaseline,
    }
    setMergeDraft((prev) => applyRulesBucketsToMerge(prev, buckets))
    setAdvancedDraft(rulesBucketsToAdvancedYaml(buckets))
  }

  const removeAppendRow = (rowId: string) => {
    const next = appendRows.filter((x) => x.id !== rowId)
    setAppendRows(next)
    const buckets = { prepend: rows, append: next, delete: deletedBaseline }
    setMergeDraft((prev) => applyRulesBucketsToMerge(prev, buckets))
    setAdvancedDraft(rulesBucketsToAdvancedYaml(buckets))
  }

  const toggleBaselineDelete = (line: string) => {
    const isDel = deletedBaseline.includes(line)
    const nextDel = isDel
      ? deletedBaseline.filter((x) => x !== line)
      : [...deletedBaseline, line]
    setDeletedBaseline(nextDel)
    const buckets = { prepend: rows, append: appendRows, delete: nextDel }
    setMergeDraft((prev) => applyRulesBucketsToMerge(prev, buckets))
    setAdvancedDraft(rulesBucketsToAdvancedYaml(buckets))
  }

  const save = async () => {
    if (uiMode === 'advanced' && advancedYamlErr) return
    const body =
      uiMode === 'visual'
        ? applyRulesBucketsToMerge(mergeDraft, {
            prepend: rows,
            append: appendRows,
            delete: deletedBaseline,
          })
        : applyRulesBucketsToMerge(
            mergeDraft,
            rulesBucketsFromAdvancedYaml(advancedDraft),
          )
    try {
      await SetProfileRulesTemplate(target.id, body)
      onSaved(t('ui.profiles.rulesModal.savedBanner'))
    } catch (e: any) {
      onError(String(e))
    }
  }

  const addedCount = rows.length + appendRows.length
  const totalCount = addedCount + (baseline?.length ?? 0)
  const needle = search.trim().toLowerCase()
  const matches = (type: string, content: string, policy: string) =>
    !needle || `${type} ${content} ${policy}`.toLowerCase().includes(needle)
  const contentRequired = formType !== 'MATCH'
  const canAdd = !contentRequired || formContent.trim().length > 0

  const modeToggle =
    uiMode === 'visual' ? (
      <Button variant="text" onClick={() => setUiMode('advanced')}>
        {'<> '}
        {t('ui.profiles.rulesModal.toYaml')}
      </Button>
    ) : (
      <Button variant="text" onClick={onSwitchToVisual}>
        {t('ui.profiles.rulesModal.toVisual')}
      </Button>
    )

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      className="edDialogWide"
      title={
        <span className="edTitleRow">
          <span>{t('ui.profiles.rulesModal.title')}</span>
          {modeToggle}
        </span>
      }
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={uiMode === 'advanced' && Boolean(advancedYamlErr)}
            onClick={() => void save()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {uiMode === 'advanced' ? (
        <div className="edField">
          <span className="edFieldLabel">{t('common.advancedYaml')}</span>
          <MonacoYamlEditor value={advancedDraft} onChange={setAdvancedDraft} />
          {advancedYamlErr ? (
            <p className="edError" role="alert">
              {t('common.yamlError', { error: advancedYamlErr })}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="edRulesSplit">
          <div className="edRulesForm">
            <Select
              label={t('ui.profiles.rulesModal.ruleType')}
              ariaLabel={t('ui.profiles.rulesModal.ruleTypeAria')}
              value={formType}
              onChange={setFormType}
              options={RULE_TYPE_OPTIONS.map((type) => ({
                value: type,
                label: type,
              }))}
            />
            <TextField
              label={t('ui.profiles.rulesModal.param')}
              value={formContent}
              onChange={setFormContent}
              placeholder={
                contentRequired
                  ? 'example.com'
                  : t('ui.profiles.rulesModal.noContentPlaceholder')
              }
              disabled={!contentRequired}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAdd) addRule('prepend')
              }}
            />
            <Select
              label={t('ui.profiles.rulesModal.proxy')}
              ariaLabel={t('ui.profiles.rulesModal.policyAria')}
              value={formPolicy}
              onChange={setFormPolicy}
              options={policyOptions.map((opt) => ({ value: opt, label: opt }))}
            />
            <div className="edRulesFormActions">
              <Button
                icon="upload"
                className="edBlockBtn"
                onClick={() => addRule('prepend')}
                disabled={!canAdd}
              >
                {t('ui.profiles.rulesModal.addStart')}
              </Button>
              <Button
                variant="tonal"
                className="edBlockBtn"
                disabled={!canAdd}
                onClick={() => addRule('append')}
              >
                {t('ui.profiles.rulesModal.addEnd')}
              </Button>
            </div>
            <Expansion header={t('ui.profiles.rulesModal.help')} icon="help">
              <p className="edBlurb edHelp">
                {t('ui.profiles.rulesModal.helpBody')}
              </p>
            </Expansion>
          </div>

          <span className="edVDivider" aria-hidden />

          <div className="edRulesList">
            <div className="edRulesHead">
              <h3>{t('ui.profiles.rulesModal.current')}</h3>
              <span className="edCount">{totalCount}</span>
              {addedCount > 0 ? (
                <span
                  className="edCount edCountAdded"
                  title={t('ui.profiles.rulesModal.added')}
                >
                  +{addedCount}
                </span>
              ) : null}
            </div>
            <TextField
              ariaLabel={t('ui.profiles.rulesModal.search')}
              placeholder={t('ui.profiles.rulesModal.search')}
              leadingIcon="search"
              value={search}
              onChange={setSearch}
            />
            <div className="edList edListTall">
              <AnimatePresence initial={false}>
                {rows
                  .filter((r) => matches(r.ruleType, r.content, r.policy))
                  .map((r) => (
                    <RuleLine
                      key={r.id}
                      ruleType={r.ruleType}
                      content={r.content}
                      policy={r.policy}
                      pos="prepend"
                      actionLabel={t('common.remove')}
                      actionIcon="close"
                      onAction={() => removeRow(r.id)}
                    />
                  ))}
              </AnimatePresence>
              {baselineLoading ? (
                <div className="edLoading">
                  <m3e-loading-indicator className="m3InlineLoader" />
                  {t('ui.profiles.rulesModal.loadingRules')}
                </div>
              ) : baselineError ? (
                <p className="edError" role="alert">
                  {baselineError}
                </p>
              ) : !baseline || baseline.length === 0 ? (
                <p className="edHint">
                  {t('ui.profiles.rulesModal.noRulesDetected')}
                </p>
              ) : (
                baseline.map((line, idx) => {
                  const parsed = parseRuleLine(line, idx)
                  if (!matches(parsed.ruleType, parsed.content, parsed.policy))
                    return null
                  const isDeleted = deletedBaseline.includes(line)
                  return (
                    <RuleLine
                      key={parsed.id}
                      ruleType={parsed.ruleType}
                      content={parsed.content}
                      policy={parsed.policy}
                      deleted={isDeleted}
                      actionLabel={
                        isDeleted ? t('common.restore') : t('common.delete')
                      }
                      actionIcon={isDeleted ? 'refresh' : 'close'}
                      onAction={() => toggleBaselineDelete(line)}
                    />
                  )
                })
              )}
              <AnimatePresence initial={false}>
                {appendRows
                  .filter((r) => matches(r.ruleType, r.content, r.policy))
                  .map((r) => (
                    <RuleLine
                      key={r.id}
                      ruleType={r.ruleType}
                      content={r.content}
                      policy={r.policy}
                      pos="append"
                      actionLabel={t('common.remove')}
                      actionIcon="close"
                      onAction={() => removeAppendRow(r.id)}
                    />
                  ))}
              </AnimatePresence>
              {addedCount === 0 && !baselineLoading && !baselineError ? (
                <p className="edHint">
                  {t('ui.profiles.rulesModal.noCustomRules')}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
