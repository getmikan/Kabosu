import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { main } from '../api/models'
import { RuleProvidersModal } from '../components/RuleProvidersModal'
import type { RuleRow } from '../rulesTable'
import {
  Button,
  IconButton,
  Select,
  Shape,
  Switch,
  TextField,
} from '../ui/M3'
import { friendlyErrorMessage } from '../utils/yaml'

import '../styles/rules.css'

// A rule row as rendered on the dashboard: a live rule (disabled=false) or a
// user-disabled baseline rule (disabled=true, carrying its exact `line`).
type DashboardRuleRow = RuleRow & { disabled?: boolean; line?: string }

export type RuleToggleApi = {
  hasActiveProfile: boolean
  baselineLoading: boolean
  baselineError: string | null
  busyLines: Set<string>
  isToggleable: (row: RuleRow) => boolean
  matchLine: (row: RuleRow) => string | null
  onDisable: (row: RuleRow) => void
  onEnable: (line: string) => void
}

export function RulesPage({
  rulesOverview,
  connectionStatus,
  rulesBusy,
  providers,
  providerBusyMap,
  providerErrMap,
  bulkBusy,
  rulesRows,
  filteredRulesRows,
  rulesTypeTop,
  ruleSearch,
  ruleTypeFilter,
  rulePolicyFilter,
  ruleTypeOptions,
  rulePolicyOptions,
  error,
  onRefresh,
  onRefreshAll,
  onRefreshOne,
  onSearchChange,
  onTypeFilterChange,
  onPolicyFilterChange,
  ruleToggle,
  onEditRules,
}: {
  rulesOverview: main.RulesOverview | null
  connectionStatus: string
  rulesBusy: boolean
  providers: any[]
  providerBusyMap: Record<string, boolean>
  providerErrMap: Record<string, string>
  bulkBusy: boolean
  rulesRows: any[]
  filteredRulesRows: DashboardRuleRow[]
  rulesTypeTop: Array<[string, number]>
  ruleSearch: string
  ruleTypeFilter: string
  rulePolicyFilter: string
  ruleTypeOptions: string[]
  rulePolicyOptions: string[]
  error: string | null
  onRefresh: () => void
  onRefreshAll: () => void
  onRefreshOne: (name: string) => void
  onSearchChange: (next: string) => void
  onTypeFilterChange: (next: string) => void
  onPolicyFilterChange: (next: string) => void
  ruleToggle: RuleToggleApi
  onEditRules?: () => void
}) {
  const { t } = useTranslation()
  const [providersModalOpen, setProvidersModalOpen] = useState(false)
  // Toggling is offered only with an active profile whose baseline loaded.
  const togglesReady = ruleToggle.hasActiveProfile && !ruleToggle.baselineError
  // Why a given live row cannot be toggled (custom / unmatched / ruleset-only).
  const rowHint = (row: DashboardRuleRow): string => {
    if (!ruleToggle.hasActiveProfile) return t('ui.rules.toggleNoProfile')
    if (String(row.type).toLowerCase().replace(/[-_]/g, '') === 'ruleset')
      return t('ui.rules.toggleRulesetHint')
    return t('ui.rules.toggleReadonlyHint')
  }
  const failedProviders = providers.filter((p) =>
    Boolean(providerErrMap[p.name]),
  ).length
  const policyKind = (proxy: string) => {
    const p = String(proxy || '').toUpperCase()
    if (p === 'DIRECT') return 'direct'
    if (p === 'REJECT' || p === 'REJECT-DROP') return 'reject'
    return 'proxy'
  }
  return (
    <div className="page ruPage">
      <div className="ruHead">
        <h2 className="srOnly">{t('ui.rules.title')}</h2>
        <div className="ruHeadActions">
          {onEditRules ? (
            <IconButton
              icon="edit"
              label={t('ui.profiles.rulesModal.title')}
              disabled={!ruleToggle.hasActiveProfile}
              onClick={onEditRules}
            />
          ) : null}
          <Button
            variant="text"
            icon="refresh"
            busy={rulesBusy}
            onClick={onRefresh}
          >
            {rulesBusy ? t('ui.rules.refreshing') : t('ui.rules.refresh')}
          </Button>
          <Button
            variant={failedProviders > 0 ? 'tonal' : 'outlined'}
            disabled={providers.length === 0}
            onClick={() => setProvidersModalOpen(true)}
            title={t('ui.rules.providersManage')}
          >
            {t('ui.rules.providersHeading')} ({providers.length})
            {failedProviders > 0 ? (
              <span
                className="ruBadge"
                aria-label={t('ui.rules.providerUpdateFailed')}
              >
                {failedProviders}
              </span>
            ) : null}
          </Button>
        </div>
      </div>
      {connectionStatus === 'connected' && rulesOverview?.lastError ? (
        <div className="inlineError" role="alert">
          <p>{rulesOverview.lastError}</p>
        </div>
      ) : null}
      {rulesRows.length > 0 ? (
        <>
          <TextField
            className="ruSearch"
            value={ruleSearch}
            onChange={onSearchChange}
            placeholder={t('ui.rules.searchPlaceholder')}
            ariaLabel={t('ui.rules.searchPlaceholder')}
            leadingIcon="search"
          />
          <div className="ruFilters">
            <Select
              value={ruleTypeFilter}
              onChange={onTypeFilterChange}
              ariaLabel={t('ui.rules.allTypes')}
              options={[
                { value: 'all', label: t('ui.rules.allTypes') },
                ...ruleTypeOptions.map((o) => ({ value: o, label: o })),
              ]}
            />
            <Select
              value={rulePolicyFilter}
              onChange={onPolicyFilterChange}
              ariaLabel={t('ui.rules.allPolicies')}
              options={[
                { value: 'all', label: t('ui.rules.allPolicies') },
                ...rulePolicyOptions.map((o) => ({ value: o, label: o })),
              ]}
            />
          </div>
          <div className="ruSummary">
            <span className="ruChip" data-total>
              <span className="ruLiveDot" aria-hidden="true" />
              {t('ui.rules.total')}: {filteredRulesRows.length}/
              {rulesRows.length}
            </span>
            {rulesTypeTop.map(([typeKey, count]) => (
              <span key={typeKey} className="ruChip">
                {typeKey}: {count}
              </span>
            ))}
          </div>
          {!ruleToggle.hasActiveProfile ? (
            <p className="muted ruNote">{t('ui.rules.toggleNoProfile')}</p>
          ) : ruleToggle.baselineError ? (
            <p className="muted ruNote">
              {t('ui.rules.toggleBaselineError', {
                error: ruleToggle.baselineError,
              })}
            </p>
          ) : null}
          <div className="ruCards">
            <AnimatePresence initial={false}>
              {filteredRulesRows.map((r, i) => {
                const isDisabled = r.disabled === true
                const line = isDisabled ? r.line : ruleToggle.matchLine(r)
                const canToggle = togglesReady && Boolean(line)
                const busy = line ? ruleToggle.busyLines.has(line) : false
                const kind = policyKind(r.proxy)
                const toggleTitle = canToggle
                  ? isDisabled
                    ? t('ui.rules.toggleEnable')
                    : t('ui.rules.toggleDisable')
                  : rowHint(r)
                return (
                  <motion.article
                    className="ruCard"
                    data-disabled={isDisabled || undefined}
                    key={
                      isDisabled
                        ? `off-${r.line}`
                        : `${r.idx}-${r.type}-${r.payload}-${i}`
                    }
                    layout="position"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: {
                        type: 'spring',
                        stiffness: 420,
                        damping: 32,
                        delay: Math.min(i, 12) * 0.03,
                      },
                    }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    whileHover={{ y: -2 }}
                  >
                    <div className="ruCardBody">
                      <strong className="ruCardTitle">
                        {r.payload || r.type}
                      </strong>
                      <div className="ruCardMeta">
                        <span className="ruPolicy" data-kind="type">
                          {r.type}
                        </span>
                        <span className="ruPolicy" data-kind={kind}>
                          {r.proxy}
                        </span>
                      </div>
                    </div>
                    <span title={toggleTitle}>
                      <Switch
                        checked={!isDisabled}
                        disabled={!canToggle || busy}
                        label={`${isDisabled ? t('ui.rules.toggleEnable') : t('ui.rules.toggleDisable')}: ${r.payload || r.type}`}
                        onChange={() => {
                          if (!canToggle || busy) return
                          if (isDisabled) {
                            if (r.line) ruleToggle.onEnable(r.line)
                          } else ruleToggle.onDisable(r)
                        }}
                      />
                    </span>
                  </motion.article>
                )
              })}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <div className="emptyState">
          <Shape name="pentagon" />
          <p className="ruNoParsed">{t('ui.rules.noParsed')}</p>
        </div>
      )}
      {error ? (
        <div className="inlineError" role="alert">
          <p>{friendlyErrorMessage(error)}</p>
        </div>
      ) : null}

      <RuleProvidersModal
        open={providersModalOpen}
        providers={providers}
        busyMap={providerBusyMap}
        errMap={providerErrMap}
        bulkBusy={bulkBusy}
        onRefreshOne={onRefreshOne}
        onRefreshAll={onRefreshAll}
        onClose={() => setProvidersModalOpen(false)}
      />
    </div>
  )
}
