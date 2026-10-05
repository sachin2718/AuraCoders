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
    <div className="rounded-2xl border-2 border-[#F0B8C4] bg-[#FFF0F3] p-4 text-[#2B050D]">
      <p className="text-sm font-medium leading-6 text-[#520919]">
        MeetMate Assistant will transcribe this meeting in real time to generate executive notes and action items.
      </p>
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm font-semibold text-[#800020]">
        <input
          aria-label="I consent to MeetMate transcription"
          checked={consented}
          className="mt-1 size-4 accent-[#800020] cursor-pointer"
          onChange={(event) => onConsentChange(event.target.checked)}
          type="checkbox"
        />
        <span>I consent to transcription and AI-generated meeting notes.</span>
      </label>
      {!serverConsentAvailable && (
        <p className="mt-2 text-xs text-[#9C0E2E]">
          Note: Local preview mode active. Consent will be maintained for this session.
        </p>
      )}
    </div>
  );
}
