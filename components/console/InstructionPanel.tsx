"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { PRESETS } from "@/lib/engine/world";

type Props = {
  instruction: string;
  onInstruction: (value: string) => void;
  chaos: boolean;
  onChaos: (value: boolean) => void;
  llm: boolean;
  onLlm: (value: boolean) => void;
  llmReady: boolean | null;
  model: string;
  running: boolean;
  onRun: () => void;
  onTour: () => void;
};

export function InstructionPanel({ instruction, onInstruction, chaos, onChaos, llm, onLlm, llmReady, model, running, onRun, onTour }: Props) {
  return (
    <form
      className="glass glass-tint"
      onSubmit={(event) => {
        event.preventDefault();
        if (!running) onRun();
      }}
    >
      <div className="label flex items-center justify-between border-b border-line px-5 py-3.5">
        <label htmlFor="instruction">One instruction</label>
        <span className="text-mute">{instruction.length}/400</span>
      </div>

      <div className="px-5 pt-4">
        <textarea
          id="instruction"
          value={instruction}
          onChange={(event) => onInstruction(event.target.value)}
          maxLength={400}
          rows={3}
          spellCheck={false}
          className="w-full resize-none rounded-[2px] border border-line bg-black/30 px-3.5 py-3 font-mono text-[13px] leading-relaxed text-ink outline-none placeholder:text-mute focus:border-lime"
          placeholder="Describe the case. Include a transaction id, for example #48213."
        />
        <ul className="mt-3 grid gap-2">
          {PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => onInstruction(preset.instruction)}
                aria-pressed={instruction === preset.instruction}
                className={`label flex w-full items-center justify-between gap-3 rounded-[2px] border px-3 py-2.5 text-left transition-colors ${
                  instruction === preset.instruction ? "border-lime/70 text-lime" : "border-line text-ink hover:border-lime/60"
                }`}
              >
                <span>{preset.label}</span>
                <span className="text-mute normal-case tracking-normal">{preset.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 px-5 pt-4">
        <Toggle checked={chaos} onChange={onChaos} title="Break something" detail="The first call to an external system times out. Watch it recover from a checkpoint." />
        <Toggle
          checked={llm && llmReady === true}
          onChange={onLlm}
          disabled={llmReady !== true}
          title={`Write with ${model}`}
          detail={
            llmReady === null
              ? "Checking for a local Ollama model..."
              : llmReady
                ? "The local model writes the email subject line and explains rulings. It never makes a decision or writes the facts."
                : `Ollama or ${model} was not found, so built-in wording is used. Decisions are unaffected.`
          }
        />
      </div>

      <div className="px-5 py-5">
        <button
          type="submit"
          disabled={running || instruction.trim().length < 3}
          className="label flex w-full items-center justify-between gap-4 rounded-[2px] border border-lime bg-lime px-5 py-4 text-void transition-colors duration-200 hover:border-ink hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? "Agents are working" : "Run the case"}
          {running ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ArrowRight aria-hidden="true" className="size-4" />}
        </button>
        <button
          type="button"
          onClick={onTour}
          disabled={running}
          className="label mt-2 flex w-full items-center justify-between gap-4 rounded-[2px] border border-line px-5 py-3.5 transition-colors hover:border-lime hover:text-lime disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>Show me in 30 seconds</span>
          <span className="text-mute normal-case tracking-normal">guided run</span>
        </button>
      </div>
    </form>
  );
}
