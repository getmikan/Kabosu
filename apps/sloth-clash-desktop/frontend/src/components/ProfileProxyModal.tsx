import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  GetProfileProxyGroupsBaseline,
  SetProfileProxyTemplate,
} from '../api/profile'
import {
  applyProxyBucketsToMerge,
  proxyBucketsFromAdvancedYaml,
  proxyBucketsFromMerge,
  proxyBucketsToAdvancedYaml,
  proxyGroupObjToRow,
  proxyTemplateFromProfile,
  type ProxyGroupRow,
} from '../mergeTemplate'
import { MonacoYamlEditor } from '../MonacoYamlEditor'
import '../styles/editors.css'
import {
  Button,
  Dialog,
  IconButton,
  Segmented,
  Select,
  SwitchRow,
  TextField,
} from '../ui/M3'
import { yamlValidationError } from '../utils/yaml'

import type { ProfileModalTarget } from './ProfileMergeModal'

type Mode = 'visual' | 'advanced'
type AppendTarget = 'prepend' | 'append'

const GROUP_TYPE_OPTIONS = [
  'select',
  'url-test',
  'fallback',
  'load-balance',
] as const

// One-line read/edit row used in baseline and custom group lists.
function GroupLine({
  name,
  groupType,
  use,
  pos,
  deleted,
  actionLabel,
  actionIcon,
  onAction,
}: {
  name: string
  groupType: string
  use: string
  pos?: AppendTarget
  deleted?: boolean
  actionLabel: string
  actionIcon: 'close' | 'refresh'
  onAction: () => void
}) {
  const { t } = useTranslation()
  const useLabel = use.trim() || '—'

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
      <span className="edRuleType">{groupType}</span>
      <span className="edRuleBody">
        <strong className="edRuleContent" title={name}>
          {name || '—'}
        </strong>
        <span className="edRulePolicy" title={useLabel}>
          {t('ui.profiles.proxyModal.useLabel', { value: useLabel })}
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

export function ProfileProxyModal({
  target,
  profiles,
  onClose,
  onSaved,
  onError,
}: {
  target: ProfileModalTarget | null
  profiles: any[] | undefined
  onClose: () => void
  onSaved: (banner: string) => void
  onError: (msg: string) => void
}) {
  const { t } = useTranslation()
  const initialRaw = target ? proxyTemplateFromProfile(profiles, target.id) : ''
  const initialBuckets = useMemo(
    () => proxyBucketsFromMerge(initialRaw),
    [initialRaw],
  )

  const [uiMode, setUiMode] = useState<Mode>('visual')
  const [mergeDraft, setMergeDraft] = useState(initialRaw)
  const [advancedDraft, setAdvancedDraft] = useState(() =>
    proxyBucketsToAdvancedYaml(initialBuckets),
  )
  const [rows, setRows] = useState<ProxyGroupRow[]>(initialBuckets.prepend)
  const [appendRows, setAppendRows] = useState<ProxyGroupRow[]>(
    initialBuckets.append,
  )
  const [deleted, setDeleted] = useState<string[]>(initialBuckets.delete)
  const [baseline, setBaseline] = useState<any[] | null>(null)
  const [baselineLoading, setBaselineLoading] = useState(target != null)
  const [baselineError, setBaselineError] = useState<string | null>(null)
  const [appendTarget, setAppendTarget] = useState<AppendTarget>('prepend')

  const [pgName, setPgName] = useState('')
  const [pgType, setPgType] = useState('url-test')
  const [pgUse, setPgUse] = useState('')
  const [pgUrl, setPgUrl] = useState('http://www.gstatic.com/generate_204')
  const [pgInterval, setPgInterval] = useState('300')
  const [pgTimeout, setPgTimeout] = useState('3000')
  const [pgMaxFailed, setPgMaxFailed] = useState('5')
  const [pgLazy, setPgLazy] = useState(true)

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
        const peek = await GetProfileProxyGroupsBaseline(id)
        if (cancelled) return
        if (peek?.lastError) {
          setBaselineError(peek.lastError)
          setBaseline([])
        } else {
          setBaseline(Array.isArray(peek?.groups) ? (peek.groups as any) : [])
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

  const addGroup = () => {
    const name = pgName.trim()
    if (!name) return
    const row: ProxyGroupRow = {
      id: `pg-${Date.now()}`,
      name,
      type: pgType,
      use: pgUse,
      url: pgUrl.trim() || 'http://www.gstatic.com/generate_204',
      interval: Number(pgInterval || '300'),
      timeout: Number(pgTimeout || '3000'),
      maxFailedTimes: Number(pgMaxFailed || '5'),
      lazy: pgLazy,
    }
    const prepNext = appendTarget === 'prepend' ? [...rows, row] : rows
    const appNext =
      appendTarget === 'append' ? [...appendRows, row] : appendRows
    setRows(prepNext)
    setAppendRows(appNext)
    setMergeDraft((prev) =>
      applyProxyBucketsToMerge(prev, {
        prepend: prepNext,
        append: appNext,
        delete: deleted,
      }),
    )
    setAdvancedDraft(
      proxyBucketsToAdvancedYaml({
        prepend: prepNext,
        append: appNext,
        delete: deleted,
      }),
    )
    setPgName('')
    setPgUse('')
  }

  const removeRow = (rowId: string) => {
    const next = rows.filter((x) => x.id !== rowId)
    setRows(next)
    const buckets = {
      prepend: next,
      append: appendRows,
      delete: deleted,
    }
    setMergeDraft((prev) => applyProxyBucketsToMerge(prev, buckets))
    setAdvancedDraft(proxyBucketsToAdvancedYaml(buckets))
  }

  const removeAppendRow = (rowId: string) => {
    const next = appendRows.filter((x) => x.id !== rowId)
    setAppendRows(next)
    const buckets = {
      prepend: rows,
      append: next,
      delete: deleted,
    }
    setMergeDraft((prev) => applyProxyBucketsToMerge(prev, buckets))
    setAdvancedDraft(proxyBucketsToAdvancedYaml(buckets))
  }

  const toggleBaselineDelete = (name: string) => {
    const isDeleted = deleted.includes(name)
    const nextDel = isDeleted
      ? deleted.filter((x) => x !== name)
      : [...deleted, name]
    setDeleted(nextDel)
    const buckets = {
      prepend: rows,
      append: appendRows,
      delete: nextDel,
    }
    setMergeDraft((prev) => applyProxyBucketsToMerge(prev, buckets))
    setAdvancedDraft(proxyBucketsToAdvancedYaml(buckets))
  }

  const onSwitchToVisual = () => {
    if (advancedYamlErr) {
      onError(t('ui.profiles.proxyModal.fixYamlBeforeVisual'))
      return
    }
    setUiMode('visual')
    const buckets =
      uiMode === 'advanced'
        ? proxyBucketsFromAdvancedYaml(advancedDraft)
        : proxyBucketsFromMerge(mergeDraft)
    setRows(buckets.prepend)
    setAppendRows(buckets.append)
    setDeleted(buckets.delete)
  }

  const save = async () => {
    if (uiMode === 'advanced' && advancedYamlErr) return
    const body =
      uiMode === 'visual'
        ? applyProxyBucketsToMerge(mergeDraft, {
            prepend: rows,
            append: appendRows,
            delete: deleted,
          })
        : applyProxyBucketsToMerge(
            mergeDraft,
            proxyBucketsFromAdvancedYaml(advancedDraft),
          )
    if (body == null) return
    try {
      await SetProfileProxyTemplate(target.id, body)
      onSaved(t('ui.profiles.proxyModal.savedBanner'))
    } catch (e: any) {
      onError(String(e))
    }
  }

  const renderBaselineBlock = () => {
    if (baselineLoading)
      return (
        <div className="edLoading">
          <m3e-loading-indicator className="m3InlineLoader" />
          {t('ui.profiles.proxyModal.loadingGroups')}
        </div>
      )
    if (baselineError)
      return (
        <p className="edError" role="alert">
          {baselineError}
        </p>
      )
    if (!baseline || baseline.length === 0)
      return (
        <p className="edHint">{t('ui.profiles.proxyModal.noGroupsDetected')}</p>
      )
    return baseline.map((gm, idx) => {
      const row = proxyGroupObjToRow(gm as any, idx)
      if (!row) return null
      const isDeleted = deleted.includes(row.name)
      return (
        <GroupLine
          key={row.id}
          name={row.name}
          groupType={row.type}
          use={row.use}
          deleted={isDeleted}
          actionLabel={isDeleted ? t('common.restore') : t('common.delete')}
          actionIcon={isDeleted ? 'refresh' : 'close'}
          onAction={() => toggleBaselineDelete(row.name)}
        />
      )
    })
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      className="edDialogWide"
      title={
        <span className="edTitleRow">
          <span>{t('ui.profiles.proxyModal.title')}</span>
          <Segmented<Mode>
            ariaLabel={t('ui.profiles.proxyModal.title')}
            value={uiMode}
            options={[
              { value: 'visual', label: t('common.visual') },
              { value: 'advanced', label: t('common.advancedYamlTab') },
            ]}
            onChange={(next) =>
              next === 'visual' ? onSwitchToVisual() : setUiMode('advanced')
            }
          />
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
        <div className="edCols edColsForm">
          <div className="edFormCol">
            <p className="edEyebrow">{t('ui.profiles.proxyModal.addGroup')}</p>
            <TextField
              label={t('ui.profiles.proxyModal.groupName')}
              ariaLabel={t('ui.profiles.proxyModal.groupNameAria')}
              value={pgName}
              onChange={setPgName}
              placeholder={t('ui.profiles.proxyModal.groupNamePlaceholder')}
            />
            <Select
              label={t('ui.profiles.proxyModal.groupType')}
              ariaLabel={t('ui.profiles.proxyModal.groupTypeAria')}
              value={pgType}
              onChange={setPgType}
              options={GROUP_TYPE_OPTIONS.map((type) => ({
                value: type,
                label: type,
              }))}
            />
            <TextField
              label={t('ui.profiles.proxyModal.useProviders')}
              value={pgUse}
              onChange={setPgUse}
              placeholder={t('ui.profiles.proxyModal.useProvidersPlaceholder')}
            />
            <TextField
              label={t('ui.profiles.proxyModal.healthcheckUrl')}
              value={pgUrl}
              onChange={setPgUrl}
              placeholder={t('ui.profiles.proxyModal.healthcheckUrlPlaceholder')}
            />
            <div className="edGrid3">
              <TextField
                label={t('ui.profiles.proxyModal.interval')}
                value={pgInterval}
                onChange={setPgInterval}
              />
              <TextField
                label={t('ui.profiles.proxyModal.timeout')}
                value={pgTimeout}
                onChange={setPgTimeout}
              />
              <TextField
                label={t('ui.profiles.proxyModal.maxFailedTimes')}
                value={pgMaxFailed}
                onChange={setPgMaxFailed}
              />
            </div>
            <SwitchRow
              label={t('ui.profiles.proxyModal.lazy')}
              checked={pgLazy}
              onChange={setPgLazy}
            />
            <Segmented<AppendTarget>
              ariaLabel={t('common.prepend')}
              value={appendTarget}
              onChange={setAppendTarget}
              options={[
                { value: 'prepend', label: t('common.prepend') },
                { value: 'append', label: t('common.append') },
              ]}
            />
            <Button icon="add" disabled={!pgName.trim()} onClick={addGroup}>
              {t('common.addShort')}
            </Button>
          </div>

          <div className="edCol">
            <div className="edBlock">
              <p className="edEyebrow">
                {t('ui.profiles.proxyModal.subscriptionSection')}
              </p>
              <div className="edList">{renderBaselineBlock()}</div>
            </div>

            <div className="edBlock">
              <p className="edEyebrow">
                {t('ui.profiles.proxyModal.prependSection')}
              </p>
              <div className="edList">
                {rows.length === 0 ? (
                  <p className="edHint">
                    {t('ui.profiles.proxyModal.noGroupsYet')}
                  </p>
                ) : null}
                <AnimatePresence initial={false}>
                  {rows.map((r) => (
                    <GroupLine
                      key={r.id}
                      name={r.name}
                      groupType={r.type}
                      use={r.use}
                      pos="prepend"
                      actionLabel={t('common.remove')}
                      actionIcon="close"
                      onAction={() => removeRow(r.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="edBlock">
              <p className="edEyebrow">
                {t('ui.profiles.proxyModal.appendSection')}
              </p>
              <div className="edList">
                {appendRows.length === 0 ? (
                  <p className="edHint">
                    {t('ui.profiles.proxyModal.noAppendGroups')}
                  </p>
                ) : null}
                <AnimatePresence initial={false}>
                  {appendRows.map((r) => (
                    <GroupLine
                      key={r.id}
                      name={r.name}
                      groupType={r.type}
                      use={r.use}
                      pos="append"
                      actionLabel={t('common.remove')}
                      actionIcon="close"
                      onAction={() => removeAppendRow(r.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
