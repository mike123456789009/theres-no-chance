// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateMarketForm } from "./create-market-form";
import { useCreateMarketWizard } from "./create-market/use-create-market-wizard";

function createResponse(ok: boolean, payload: unknown): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function getFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function createInstitutionAccessPayload() {
  return {
    activeMembership: null,
    verifiedInstitutionEmails: [],
    pendingChallenge: null,
    canCreateInstitutionMarkets: false,
  };
}

function createWizardFetchMock(options: {
  criteriaResponse?: Response | Promise<Response>;
  marketResponses?: Array<Response | Promise<Response>>;
} = {}) {
  let marketResponseIndex = 0;

  return vi.fn(async (input: RequestInfo | URL) => {
    const url = getFetchUrl(input);
    if (url === "/api/account/institution-access") {
      return createResponse(true, createInstitutionAccessPayload());
    }
    if (url === "/api/markets/criteria-suggestion") {
      return options.criteriaResponse ?? createResponse(false, { error: "Criteria response not configured." });
    }
    if (url === "/api/markets") {
      const response = options.marketResponses?.[marketResponseIndex];
      marketResponseIndex += 1;
      return response ?? createResponse(false, { error: "Market response not configured." });
    }
    return createResponse(false, { error: `Unexpected URL: ${url}` });
  });
}

function createFetchMock(criteriaResponse: Response | Promise<Response>) {
  return createWizardFetchMock({ criteriaResponse });
}

function getCriteriaSuggestionCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) => getFetchUrl(input as RequestInfo | URL) === "/api/markets/criteria-suggestion");
}

function getMarketCreationCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) => getFetchUrl(input as RequestInfo | URL) === "/api/markets");
}

function getJsonRequestBody(call: unknown[]) {
  const [, requestInit] = call;
  return JSON.parse(String((requestInit as RequestInit).body));
}

async function goToBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Market basics");
}

async function fillValidBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Question"),
    "Will the campus library stay open after midnight during finals week?"
  );
  await user.type(
    screen.getByLabelText("Description"),
    "The market resolves based on official campus library hours posted for the spring finals week schedule."
  );
  await user.selectOptions(screen.getByLabelText("Visibility"), "unlisted");
}

async function goToCriteria(user: ReturnType<typeof userEvent.setup>) {
  await goToBasics(user);
  await fillValidBasics(user);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Edit resolution criteria");
}

async function fillValidCriteria(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Resolves YES if"),
    "Official campus library hours confirm the library stayed open after midnight."
  );
  await user.type(
    screen.getByLabelText("Resolves NO if"),
    "Official campus library hours do not confirm the library stayed open after midnight."
  );
}

async function goToSources(user: ReturnType<typeof userEvent.setup>) {
  await goToCriteria(user);
  await fillValidCriteria(user);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Optional references");
}

async function goToReview(user: ReturnType<typeof userEvent.setup>) {
  await goToSources(user);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Review and submit");
}

function GenerateCriteriaHarness() {
  const wizard = useCreateMarketWizard();

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void wizard.generateCriteria();
        }}
      >
        Generate
      </button>
      {wizard.errorMessage ? <p>{wizard.errorMessage}</p> : null}
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreateMarketForm criteria generation", () => {
  it("generates binary criteria from valid basics and fills the editable fields", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<Response>();
    const fetchMock = createFetchMock(deferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateMarketForm />);
    await goToCriteria(user);

    await user.click(screen.getByRole("button", { name: "Generate binary criteria" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generating..." })).toBeDisabled();
    });

    const criteriaCalls = getCriteriaSuggestionCalls(fetchMock);
    expect(criteriaCalls).toHaveLength(1);
    const [, requestInit] = criteriaCalls[0];
    expect(requestInit).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
    );
    const requestBody = JSON.parse(String((requestInit as RequestInit).body));
    expect(requestBody).toMatchObject({
      question: "Will the campus library stay open after midnight during finals week?",
      description:
        "The market resolves based on official campus library hours posted for the spring finals week schedule.",
      visibility: "unlisted",
    });
    expect(Number.isNaN(new Date(requestBody.closeTime).getTime())).toBe(false);

    deferred.resolve(
      createResponse(true, {
        criteria: {
          resolvesYesIf: "Official library hours confirm the library stayed open after midnight.",
          resolvesNoIf: "Official library hours do not confirm the library stayed open after midnight.",
        },
      })
    );

    await screen.findByText("Suggested criteria generated. Review and edit before submission.");
    expect(screen.getByLabelText("Resolves YES if")).toHaveValue(
      "Official library hours confirm the library stayed open after midnight."
    );
    expect(screen.getByLabelText("Resolves NO if")).toHaveValue(
      "Official library hours do not confirm the library stayed open after midnight."
    );
  });

  it("shows criteria API errors without overwriting editable fields", async () => {
    const user = userEvent.setup();
    const fetchMock = createFetchMock(createResponse(false, { error: "Criteria service offline." }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateMarketForm />);
    await goToCriteria(user);

    await user.click(screen.getByRole("button", { name: "Generate binary criteria" }));

    expect(await screen.findByText("Criteria service offline.")).toBeInTheDocument();
    expect(screen.getByLabelText("Resolves YES if")).toHaveValue("");
    expect(screen.getByLabelText("Resolves NO if")).toHaveValue("");
    expect(getCriteriaSuggestionCalls(fetchMock)).toHaveLength(1);
  });

  it("blocks generate when basics are invalid and does not call the criteria API", async () => {
    const user = userEvent.setup();
    const fetchMock = createFetchMock(createResponse(true, { criteria: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GenerateCriteriaHarness />);

    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText("Question must be at least 12 characters.")).toBeInTheDocument();
    expect(getCriteriaSuggestionCalls(fetchMock)).toHaveLength(0);
  });
});

describe("CreateMarketForm wizard behavior", () => {
  it("supports button and keyboard navigation across the first wizard steps", async () => {
    const user = userEvent.setup();
    const fetchMock = createWizardFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateMarketForm />);

    expect(screen.getByText(/Step 1 of 6:/)).toHaveTextContent("Rules");
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText(/Step 2 of 6:/)).toHaveTextContent("Economics + policy");
    expect(screen.getByText("Fees and platform policy")).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByText(/Step 1 of 6:/)).toHaveTextContent("Rules");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(/Step 2 of 6:/)).toHaveTextContent("Economics + policy");
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText(/Step 1 of 6:/)).toHaveTextContent("Rules");
  });

  it("validates optional reference rows before moving to review", async () => {
    const user = userEvent.setup();
    const fetchMock = createWizardFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateMarketForm />);
    await goToSources(user);

    await user.click(screen.getByRole("button", { name: "+ Add reference" }));
    await user.type(screen.getByLabelText("Label"), "X");
    await user.type(screen.getByLabelText("URL"), "http://example.com/source");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Reference 1: label must be at least 2 characters.")).toBeInTheDocument();
    expect(screen.getByText("Optional references")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Label"));
    await user.type(screen.getByLabelText("Label"), "Official schedule");
    await user.clear(screen.getByLabelText("URL"));
    await user.type(screen.getByLabelText("URL"), "https://example.com/source");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Review and submit")).toBeInTheDocument();
  });

  it("submits draft and review payloads with distinct success messages", async () => {
    const user = userEvent.setup();
    const fetchMock = createWizardFetchMock({
      marketResponses: [
        createResponse(true, {
          marketId: "market-draft",
          status: "draft",
          submissionMode: "draft",
          message: "Market draft saved successfully.",
        }),
        createResponse(true, {
          marketId: "market-review",
          status: "review",
          submissionMode: "review",
          message: "Market submitted for review.",
        }),
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateMarketForm />);
    await goToReview(user);

    expect(screen.getByText("Listing fee:")).toBeInTheDocument();
    expect(screen.getByText(/Market-maker rake:/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Tags (comma-separated)"), "campus, library");
    await user.type(screen.getByLabelText("Risk flags (comma-separated, optional)"), "schedule-risk");

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Market draft saved successfully.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText("Market submitted for review.")).toBeInTheDocument();

    const marketCalls = getMarketCreationCalls(fetchMock);
    expect(marketCalls).toHaveLength(2);

    const draftPayload = getJsonRequestBody(marketCalls[0]);
    expect(draftPayload).toMatchObject({
      submissionMode: "draft",
      visibility: "unlisted",
      feeBps: 50,
      tags: ["campus", "library"],
      riskFlags: ["schedule-risk"],
      accessRules: { cardShadowTone: "mint" },
    });

    const reviewPayload = getJsonRequestBody(marketCalls[1]);
    expect(reviewPayload).toMatchObject({
      submissionMode: "review",
      visibility: "unlisted",
      feeBps: 50,
      tags: ["campus", "library"],
      riskFlags: ["schedule-risk"],
      accessRules: { cardShadowTone: "mint" },
    });
  });
});
