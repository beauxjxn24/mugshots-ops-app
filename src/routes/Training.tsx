// Training resources — the study guides and certification packets, on the staff
// side where the people being certified can actually get to them.
//
// One list, grouped by station, opening in the app. Deliberately NOT a duty
// list: each of these is a five-day training programme with a build test per
// day, and the line under every title says so, because the last thing anyone
// needs mid-shift is to open a nine-page packet looking for a closing
// checklist that was never in it.
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, ExternalLink, FileText } from 'lucide-react'
import { Page, Card } from '../components/ui'
import { PdfPages } from '../components/PdfPages'
import { TRAINING, TRAINING_GROUPS, resourceById, resourceUrl } from '../lib/training'

export function Training() {
  const [params, setParams] = useSearchParams()
  const open = resourceById(params.get('doc') ?? '')

  if (open) {
    return (
      <Page
        title={open.title}
        subtitle={open.what}
        width="narrow"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setParams({}, { replace: true })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-ink"
            >
              <ArrowLeft size={13} /> All resources
            </button>
            {/* An escape hatch to the browser's own viewer — for printing, or
                if a device can't draw it. */}
            <a
              href={resourceUrl(open)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-ink"
            >
              <ExternalLink size={13} /> Open
            </a>
          </div>
        }
      >
        <PdfPages url={resourceUrl(open)} />
      </Page>
    )
  }

  return (
    <Page
      title="Training resources"
      subtitle={`${TRAINING.length} study guides & certification packets`}
      width="narrow"
    >
      {TRAINING_GROUPS().map((g) => (
        <section key={g}>
          <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted">{g}</div>
          <div className="space-y-2">
            {TRAINING.filter((r) => r.group === g).map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <button
                  onClick={() => setParams({ doc: r.id })}
                  className="flex w-full items-start gap-3 p-3.5 text-left hover:bg-brand/[0.04]"
                >
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                    <FileText size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[15px] font-semibold text-ink">
                      {r.title}
                    </span>
                    {/* What it IS, not just what it's called. */}
                    <span className="mt-0.5 block text-xs leading-snug text-muted">{r.what}</span>
                    <span className="mt-1 block text-[11px] text-muted/70">{r.pages} pages</span>
                  </span>
                </button>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <Card className="flex items-start gap-2.5 border-brand/20 bg-brand/[0.04] p-3.5">
        <BookOpen size={15} className="mt-0.5 shrink-0 text-brand" />
        <p className="text-xs leading-snug text-muted">
          These are training and certification packets — the five-day programme for a station and
          the build tests that go with it. Closing duties live on the{' '}
          <b className="text-ink/80">Sidework</b> screen, not in here.
        </p>
      </Card>
    </Page>
  )
}
