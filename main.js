(async function () {
  "use strict";
  const buttonId = "pr2r-release-button";

  function createButton() {
    const existing = document.getElementById(buttonId);
    if (existing) {
      existing.remove(); // useful for testing
    }
    const mergeButton = document.querySelector(".btn-group-merge");
    if (!mergeButton) {
      return;
    }
    const result = document.createElement("a");
    result.id = buttonId;
    Array.from(mergeButton.classList).forEach(c => {
      if (c === "btn-group-merge") {
        return;
      }
      result.classList.add(c);
    });
    result.innerText = "Create release...";
    result.style.float = "right";

    mergeButton.parentElement.parentElement.parentElement.appendChild(result);
    return result;
  }

  function findPullRequestBranchName() {
    // this is a little weak: it relies on the second-found
    // commit-ref being for the PR branch (the first is a hidden
    // ref for the target of the PR, typically master or main)
    const elements = Array.from(document.querySelectorAll(".commit-ref"));
    if (elements.length < 2) {
      throw new Error("Can't determine PR branch: unable to find at least two .commit-ref elements");
    }
    return elements[1].textContent.trim();
  }

  function findPullRequestTitle() {
    const el = document.querySelector("bdi.js-issue-title");
    if (!el) {
      console.error("Can't determine PR title: no 'bdi.js-issue-title' element found");
      return "New release";
    }
    return el.textContent.trim();
  }

  function findPullRequestSummary() {
    // relies on the first task-list element being the PR summary
    const el = document.querySelector("task-lists");
    if (!el) {
      console.error("Can't determine PR summary: no 'task-list' elements found");
      return "- edit me please -";
    }
    const lines = el.textContent.trim().split("\n");

    // attempt to only get the summary, between headings "Summary" and "Testing notes"
    // (or at least, everything after Summary)
    let inSummary = false;
    const summaryLines = lines.reduce((acc, cur) => {
      cur = cur.trim();
      if (cur.match(/summary/i)) {
        inSummary = true;
        return acc;
      }
      if (cur.match(/testing notes/i)) {
        inSummary = false;
        return acc;
      }
      if (inSummary) {
        acc.push(cur);
      }
      return acc;
    }, []);

    // if we couldn't use simple logic to get the summary only, then return all the content
    return summaryLines.length > 0
      ? summaryLines.join("\n").trim()
      : lines.join("\n").trim();
  }

  function findProjectBaseUrl() {
    const allParts = window.location.href.split("/");
    return allParts.slice(0, allParts.indexOf(window.location.hostname) + 3).join("/");
  }
  function projectRelativeUrl(rel) {
    try {
      return new URL([ findProjectBaseUrl(), rel].join("/"));
    } catch (e) {
      console.log(e, {
        projectBase: findProjectBaseUrl(),
        rel
      });
    }
  }

  async function findAndIncrementLatestTag() {
    const url = projectRelativeUrl("tags");
    const fallback = "v-edit-me";
    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "text/fragment+html"
      }
    });
    if (!response.ok) {
      console.error("Can't query tags");
      return fallback;
    }
    const text = await response.text();
    const result = text.match(/>([^<]+)/);
    if (!result) {
      console.error(`Can't grok tag info from html fragment: '${text}'`);
      return fallback;
    }
    if (!result[1]) {
      return fallback;
    }
    const latest = result[1];
    const version = latest.replace(/[^0-9\.]/g, "");
    const parts = version.toString().split(".");
    let last = parseInt(parts[parts.length - 1]);
    last++;
    parts[parts.length - 1] = last.toString();
    if (latest.match(/^v/)) {
      return `v${parts.join(".")}`;
    }
    return parts.join(".");
  }

  async function main() {

    console.info("Release link determined to be:", (await generateReleaseUrl()).toString());

    const quickButton = createButton();
    quickButton.addEventListener("click", e => e.stopPropagation());

    quickButton.href = await generateReleaseUrl();
    quickButton.target = "_blank";

    window.setInterval(updateReleaseUrl, 1000);
  }

  async function updateReleaseUrl() {
    const el = document.getElementById(buttonId);
    if (el) {
      const updated = await generateReleaseUrl();
      if (updated !== el.href) {
        console.log("updating release url...", updated);
        el.href = await generateReleaseUrl();
      }
    }
  }

  async function generateReleaseUrl() {
    const url = projectRelativeUrl("releases/new");

    url.searchParams.set("target", findPullRequestBranchName());
    url.searchParams.set("title", findPullRequestTitle());
    const parts = window.location.href.split("/");
    const prId = parts[parts.length - 1];
    url.searchParams.set("body", [ `### Pull request: #${prId}`, "", findPullRequestSummary() ].join("\n"));
    url.searchParams.set("tag", await findAndIncrementLatestTag());
    return url.toString();
  }

  async function waitForElement(selector, maxWaitMs, started, resolver) {
    if (started === undefined) {
      started = Date.now();
    }
    if (maxWaitMs === undefined) {
      maxWaitMs = 60000;
    }
    if (Date.now() - started > maxWaitMs) {
      return;
    }
    if (document.querySelector(selector)) {
      if (resolver) {
        resolver();
      }
      return;
    }
    if (resolver) {
      return window.setTimeout(() => waitForElement(selector, maxWaitMs, started, resolver), 100);
    }
    return new Promise(resolve => {
      if (document.querySelector(selector)) {
        return resolve();
      }
      window.setTimeout(() => waitForElement(selector, maxWaitMs, started, resolve), 100);
    });
  }

  await waitForElement("task-lists");
  await waitForElement(".btn-group-merge");
  await main();
})();
