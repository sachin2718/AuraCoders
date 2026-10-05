"use client";

type ConsentBannerProps = {
  consented: boolean;
  onConsentChange: (consented: boolean) => void;
  serverConsentAvailable: boolean;
};

export default function ConsentBanner({
  consented,
  onConsentChange,
  serverConsentAvailable,
}: ConsentBannerProps) {
  return (
    <div className="rounded-xl border border-indigo-300/25 bg-indigo-400/10 p-4">
      <p className="text-sm leading-6 text-slate-100">
        MeetMate Assistant will transcribe this meeting (your speech is converted to text and used to create notes).
      </p>
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-slate-200">
        <input
          aria-label="I consent to MeetMate transcription"
          checked={consented}
          className="mt-1 size-4 accent-indigo-400"
          onChange={(event) => onConsentChange(event.target.checked)}
          type="checkbox"
        />
        <span>I consent to transcription and AI-generated meeting notes.</span>
      </label>
      {!serverConsentAvailable && (
        <p className="mt-2 text-xs text-amber-200">
          Local demo: this consent cannot be logged until meeting metadata and the consent API are available.
        </p>
      )}
    </div>
  );
}
