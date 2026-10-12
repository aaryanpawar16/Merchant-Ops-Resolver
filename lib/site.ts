// Fill in the links marked "#" before submitting. Anything still "#" is hidden on the site, so there are
// no dead buttons.
export const site = {
  name: "Merchant Ops Resolver",
  hackathon: "#neatHack",
  links: {
    // The public repository.
    github: "https://github.com/aaryanpawar16/Merchant-Ops-Resolver",
    // The demo video.
    demo: "https://youtu.be/Hm-50U2blq8",
    // A public post tagged #neatHack.
    posts: "https://x.com/aaryanpawar167/status/2109351713455190303",
    // neatlogs traces of real runs, exported as Markdown in the repo (the dashboard project is private).
    neatlogs: "https://github.com/aaryanpawar16/Merchant-Ops-Resolver/tree/main/evidence/neatlogs",
    // The Entire checkpoint of this project's build (https://entire.io/gh/OWNER/REPO/commit/SHA).
    entire: "https://entire.io/gh/aaryanpawar16/Merchant-Ops-Resolver/commit/102712c906c846377e331764777a03b42dabff00",
    // The business plan built in cfo.ai.
    plan: "https://cfo.ai/s/zjvRY4EQYV-5T8uH",
  },
} as const;

// True once a link has been filled in.
export function isLinked(url: string): boolean {
  return url !== "#" && url.trim() !== "";
}
