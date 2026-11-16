import { BackHeader, LinkButton, Screen } from '../components/ui'

/** An honest placeholder for screens that are designed but not built yet. */
export default function ComingSoon({ title, milestone }: { title: string; milestone: string }) {
  return (
    <Screen>
      <BackHeader title={title} />
      <div className="rounded-2xl bg-warn/15 p-4 text-sm font-semibold text-warn-ink">
        Not built yet. This screen arrives in {milestone}.
      </div>
      <div className="mt-auto">
        <LinkButton to="/" kind="secondary">
          Back to Home
        </LinkButton>
      </div>
    </Screen>
  )
}
