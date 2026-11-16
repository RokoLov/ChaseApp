import { useRef, useState } from 'react'
import { resizeToSquare } from '../lib/image'
import { Avatar } from './ui'

/** A round photo with a button that opens the phone's photo chooser. */
export function PhotoPicker({
  name,
  photo,
  onChange,
}: {
  name: string
  photo: string | null
  onChange: (photo: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  async function pick(file: File | undefined) {
    if (!file) return
    try {
      onChange(await resizeToSquare(file))
      setError('')
    } catch {
      setError('That photo could not be used. Try another one.')
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar name={name || '+'} photo={photo} size={96} ring="brand" />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand"
        >
          {photo ? 'Change photo' : 'Add photo'}
        </button>
        {photo && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-full bg-raised px-3 py-1.5 text-xs font-semibold text-muted"
          >
            Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error ? (
        <p className="text-xs text-danger-ink">{error}</p>
      ) : (
        !photo && <p className="text-xs text-muted">or keep the default avatar</p>
      )}
    </div>
  )
}
