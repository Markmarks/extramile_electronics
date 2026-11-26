'use client';

import { useActionState, useState } from 'react';
import {
  deleteAccountAction,
  setMarketingConsentAction,
  type PrivacyFormState,
} from '@/lib/account/actions';

const idle: PrivacyFormState = { status: 'idle' };

function Feedback({ state }: { state: PrivacyFormState }) {
  if (state.status === 'saved')
    return (
      <p role="status" className="text-[13px] font-medium text-success">
        {state.message}
      </p>
    );
  if (state.status === 'error')
    return (
      <p role="alert" className="text-[13px] font-medium text-destructive">
        {state.error}
      </p>
    );
  return null;
}

export function MarketingForm({ optedIn }: { optedIn: boolean }) {
  const [state, action, pending] = useActionState(setMarketingConsentAction, idle);
  return (
    <form action={action} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="sr-only">Marketing emails</legend>
        <label className="flex items-center gap-3 text-[15px]">
          <input type="radio" name="marketing" value="on" defaultChecked={optedIn} />
          Yes, email me occasional offers and new arrivals
        </label>
        <label className="flex items-center gap-3 text-[15px]">
          <input type="radio" name="marketing" value="off" defaultChecked={!optedIn} />
          No marketing emails (order emails still arrive)
        </label>
      </fieldset>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-tinted btn-sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save choice'}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccountAction, idle);
  const [typed, setTyped] = useState('');
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="confirm" className="field-label">
        Type DELETE to confirm
      </label>
      <input
        id="confirm"
        name="confirm"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="field font-mono"
      />
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending || typed.trim() !== 'DELETE'}
        className="btn w-full bg-destructive text-white disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete my account'}
      </button>
    </form>
  );
}
