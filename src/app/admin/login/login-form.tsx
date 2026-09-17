"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <Label htmlFor="password" className="text-ink-soft text-sm font-normal">
          Пароль
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="border-line-strong bg-card h-12 rounded-sm text-base"
          aria-invalid={Boolean(state?.error)}
        />
        {state?.error && <p className="text-destructive text-sm">{state.error}</p>}
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="bg-ink text-paper hover:bg-ink/90 h-12 w-full rounded-sm text-base"
      >
        {pending ? "Проверяем…" : "Войти"}
      </Button>
    </form>
  );
}
