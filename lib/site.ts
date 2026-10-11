// Fill in the links marked "#" before submitting. Anything still "#" is hidden on the site, so there are
// no dead buttons.
export const site = {
  name: "Merchant Ops Resolver",
  hackathon: "#neatHack",
  links: {
    // The public repository.
    github: "#",
    // The demo video.
    demo: "#",
    // A public post tagged #neatHack.
    posts: "#",
    // A shared trace of a real run in neatlogs.
    neatlogs: "#",
    // The Entire checkpoint of this project's build (https://entire.io/gh/OWNER/REPO/commit/SHA).
    entire: "#",
    // The business plan built in cfo.ai.
    plan: "https://cfo.ai/s/zjvRY4EQYV-5T8uH",
  },
} as const;

// True once a link has been filled in.
export function isLinked(url: string): boolean {
  return url !== "#" && url.trim() !== "";
}
