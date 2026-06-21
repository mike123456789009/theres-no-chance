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

function createFetchMock(criteriaResponse: Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = getFetchUrl(input);
    if (url === "/api/account/institution-access") {
      return createResponse(true, createInstitutionAccessPayload());
    }
    if (url === "/api/markets/criteria-suggestion") {
      return criteriaResponse;
    }
    return createResponse(false, { error: `Unexpected URL: ${url}` });
  });
}

function getCriteriaSuggestionCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) => getFetchUrl(input as RequestInfo | URL) === "/api/markets/criteria-suggestion");
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
