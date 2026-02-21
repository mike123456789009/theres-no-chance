"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Stage = {
  id: string;
  title: string;
  blurb: string;
  mediaLabel: string;
  assetPath: string;
  assetAlt: string;
};

const STAGES: Stage[] = [
  {
    id: "open",
    title: "Market Opens",
    blurb: "Trading runs until close time. Anyone can participate in price discovery before resolution starts.",
    mediaLabel: "Open market and live price movement",
    assetPath: "/assets/community-resolve/market-opens.svg",
    assetAlt: "Illustration of an open market with live YES and NO pricing.",
  },
  {
    id: "close",
    title: "Market Closes",
    blurb: "Trading stops. Community resolution window opens for 24 hours.",
    mediaLabel: "Clock lock and community voting start",
    assetPath: "/assets/community-resolve/market-closes.svg",
    assetAlt: "Illustration showing trading lock and vote window start.",
  },
  {
    id: "stake",
    title: "Resolvers Stake",
    blurb: "Resolvers can stake from $1 up to 2x the average bet size to support YES or NO.",
    mediaLabel: "Stake chips entering YES/NO columns",
    assetPath: "/assets/community-resolve/resolver-stake.svg",
    assetAlt: "Illustration of resolver stakes entering YES and NO pools.",
  },
  {
    id: "provisional",
    title: "Provisional Outcome",
    blurb: "If one side has more stake, provisional outcome is set. If tied, market goes directly to human adjudication.",
    mediaLabel: "Vote totals and provisional result",
    assetPath: "/assets/community-resolve/provisional-vote.svg",
    assetAlt: "Illustration of vote totals and provisional YES or NO result.",
  },
  {
    id: "auto-finalize",
    title: "No-Challenge Auto Finalization",
    blurb: "If challenge window expires with no valid challenge, final outcome automatically locks to the provisional result.",
    mediaLabel: "Unchallenged provisional outcome auto-finalizes",
    assetPath: "/assets/community-resolve/no-challenge-finalize.svg",
    assetAlt: "Illustration of automatic finalization when no challenge is submitted.",
  },
  {
    id: "challenge",
    title: "Challenge Window",
    blurb: "Out-voted resolvers can challenge within 24 hours by doubling down on their original stake.",
    mediaLabel: "Challenge action with exact double-down",
    assetPath: "/assets/community-resolve/challenge-double-down.svg",
    assetAlt: "Illustration of out-voted resolvers submitting exact double-down challenges.",
  },
  {
    id: "adjudication",
    title: "Human Adjudication",
    blurb: "If challenged or tied, a human adjudicator sets the final YES/NO outcome.",
    mediaLabel: "Adjudicator decision stage",
    assetPath: "/assets/community-resolve/human-adjudication.svg",
    assetAlt: "Illustration of human adjudicator choosing final YES or NO outcome.",
  },
  {
    id: "settlement",
    title: "Settlement",
    blurb:
      "Correct resolvers earn pooled rewards, challengers are settled by correctness, market maker earns dynamic rake, and treasury receives platform rake.",
    mediaLabel: "Final payouts and treasury split",
    assetPath: "/assets/community-resolve/settlement-payouts.svg",
    assetAlt: "Illustration of resolver, market maker, and treasury payout splits.",
  },
];

export default function CommunityResolvePage() {
  const [activeId, setActiveId] = useState<string>(STAGES[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target instanceof HTMLElement) {
          const stageId = visible.target.dataset.stageId;
          if (stageId) setActiveId(stageId);
        }
      },
      {
        threshold: [0.3, 0.55, 0.8],
        rootMargin: "-20% 0px -30% 0px",
      }
    );

    const nodes = document.querySelectorAll<HTMLElement>("[data-stage-id]");
    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, []);

  const activeStage = useMemo(() => STAGES.find((stage) => stage.id === activeId) ?? STAGES[0], [activeId]);

  return (
    <main className="community-resolve-page">
      <header className="community-resolve-hero">
        <p className="create-kicker">Community Resolve</p>
        <h1 className="create-title">How market outcomes get decided</h1>
        <p className="create-copy">
          Scroll through each stage of lifecycle resolution, from market close to final payout distribution.
        </p>
        <div className="community-resolve-hero-links">
          <Link href="/create">Open market maker wizard</Link>
          <Link href="/markets">Browse markets</Link>
        </div>
      </header>

      <section className="community-resolve-layout" aria-label="Community resolve timeline">
        <aside className="community-resolve-rail" aria-label="Stage progress">
          <p className="community-resolve-rail-label">Stage</p>
          <ol>
            {STAGES.map((stage, index) => (
              <li key={stage.id} className={activeId === stage.id ? "is-active" : undefined}>
                <span>{index + 1}</span>
                <strong>{stage.title}</strong>
              </li>
            ))}
          </ol>

          <div className="community-resolve-active-media" aria-live="polite">
            <p className="community-resolve-active-kicker">Active visual</p>
            <Image
              src={activeStage.assetPath}
              alt={activeStage.assetAlt}
              width={920}
              height={560}
              className="community-resolve-active-image"
            />
            <p>{activeStage.mediaLabel}</p>
          </div>
        </aside>

        <div className="community-resolve-stages">
          {STAGES.map((stage, index) => (
            <article key={stage.id} data-stage-id={stage.id} className={activeId === stage.id ? "is-active" : undefined}>
              <div className="community-resolve-stage-media">
                <div className="community-resolve-stage-badge">{index + 1}</div>
                <Image src={stage.assetPath} alt={stage.assetAlt} width={920} height={560} className="community-resolve-stage-image" />
                <p>{stage.mediaLabel}</p>
              </div>
              <div className="community-resolve-stage-copy">
                <h2>{stage.title}</h2>
                <p>{stage.blurb}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
