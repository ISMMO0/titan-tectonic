"use client";

import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleDollarSign,
  Info,
  Landmark,
  LockKeyhole,
  LogOut,
  PiggyBank,
  ReceiptText,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/app/login/actions";
import { formatEUR } from "@/lib/format";
import { speak, stopSpeaking } from "@/lib/voice/browser";
import { ConfirmCard, type ActionStatus } from "./ConfirmCard";
import { MessageBubble } from "./MessageBubble";
import { MicButton } from "./MicButton";

type PendingAction = { id: string; type: string; summary: string };
type Message = { role: "user" | "assistant"; content: string; actions?: PendingAction[] };
type Account = { id: string; type: string; name: string; balance: number | string };
type Transaction = {
  id: string;
  amount: number | string;
  description: string;
  category?: string;
  booked_at: string;
};
type View = "agent" | "activity" | "preferences";

// Gemini expects the conversation to start with the user. When Titan spoke first
// (proactive greeting), add a short opener so a reply like "yes" keeps its context.
function toHistory(messages: Message[]) {
  const history = messages.map(({ role, content }) => ({ role, content }));
  if (history[0]?.role === "assistant") history.unshift({ role: "user", content: "(opened the app)" });
  return history.slice(-30);
}

const starters = [
  { label: "Understand my spending", prompt: "Help me understand my recent spending.", icon: BarChart3 },
  { label: "Set a savings goal", prompt: "I want to set a new savings goal.", icon: PiggyBank },
  { label: "Make a payment", prompt: "I want to make a payment.", icon: WalletCards },
];

export function ChatWindow({
  firstName,
  accounts,
  transactions,
}: {
  firstName: string;
  accounts: Account[];
  transactions: Transaction[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [actionStatus, setActionStatus] = useState<Record<string, ActionStatus>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<View>("agent");
  const [proactivity, setProactivity] = useState("important");
  const [bankingEnabled, setBankingEnabled] = useState(true);
  const [insuranceMode, setInsuranceMode] = useState("ask");
  const [investingEnabled, setInvestingEnabled] = useState(false);
  const [permissions, setPermissions] = useState({
    accounts: true,
    goals: true,
    calendar: false,
    location: false,
  });
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(transactions[0]?.id ?? "");
  const [voiceOn, setVoiceOn] = useState(false);
  // "Titan speaks first": proactive message about the most important life moment.
  const [insight, setInsight] = useState<{ reply: string; pendingActions?: PendingAction[] } | null>(null);
  const insightRequested = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const checking = accounts.find((account) => account.type === "checking");
  const savings = accounts.find((account) => account.type === "savings");
  const displayName = firstName || "there";
  const selectedActivity = transactions.find((transaction) => transaction.id === selectedTransaction);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (insightRequested.current) return; // React dev mode runs effects twice
    insightRequested.current = true;
    fetch("/api/insights", { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.reply && setInsight(data))
      .catch(() => {}); // keep the default welcome text
  }, []);

  function addAssistant(content: string, actions?: PendingAction[], speakIt = voiceOn) {
    setMessages((m) => [...m, { role: "assistant", content, actions }]);
    if (speakIt) void speak(content);
  }

  // Talking to Titan turns spoken replies on.
  function sendVoice(text: string) {
    setVoiceOn(true);
    void send(text, true);
  }

  async function send(text: string, speakReply = voiceOn) {
    const content = text.trim();
    if (!content || loading) return;
    stopSpeaking();
    // First message after a proactive greeting: keep the greeting as context.
    const start: Message[] =
      messages.length === 0 && insight && proactivity !== "ask"
        ? [{ role: "assistant", content: insight.reply, actions: insight.pendingActions }]
        : messages;
    const next = [...start, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: toHistory(next),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      addAssistant(data.reply, data.pendingActions, speakReply);
    } catch (err) {
      addAssistant((err as Error).message, undefined, false);
    } finally {
      setLoading(false);
    }
  }

  async function resolveAction(id: string, decision: "confirm" | "cancel") {
    setActionStatus((current) => ({ ...current, [id]: "working" }));
    const res = await fetch(`/api/actions/${id}/${decision}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus((current) => ({ ...current, [id]: "failed" }));
      addAssistant(data.error ?? "That action could not be completed.", undefined, false);
      return;
    }
    setActionStatus((current) => ({ ...current, [id]: decision === "confirm" ? "confirmed" : "cancelled" }));
    if (voiceOn) void speak(decision === "confirm" ? "Done." : "Cancelled.");
    router.refresh();
  }

  return (
    <div className="titan-shell">
      <header className="topbar">
        <button
          className="wordmark wordmark-button"
          type="button"
          onClick={() => setActiveView("agent")}
          aria-label="Titan home"
        >
          Titan
        </button>
        <nav className="topnav" aria-label="Primary navigation">
          <button
            className={`nav-link ${activeView === "agent" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("agent")}
          >
            <Sparkles size={17} />
            Your agent
          </button>
          <button
            className={`nav-link ${activeView === "activity" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("activity")}
          >
            <CircleDollarSign size={17} />
            Activity
          </button>
          <button
            className={`nav-link ${activeView === "preferences" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("preferences")}
          >
            <ShieldCheck size={17} />
            Preferences
          </button>
        </nav>
        <div className="profile-menu">
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              if (voiceOn) stopSpeaking();
              setVoiceOn(!voiceOn);
            }}
            aria-pressed={voiceOn}
            title={voiceOn ? "Turn voice replies off" : "Turn voice replies on"}
            aria-label={voiceOn ? "Turn voice replies off" : "Turn voice replies on"}
          >
            {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <span className="avatar">{displayName.charAt(0).toUpperCase()}</span>
          <span className="profile-name">{displayName}</span>
          <form action={logout}>
            <button className="icon-button" type="submit" title="Sign out" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </header>

      {activeView === "agent" && (
        <main className="agent-layout">
          <section className="agent-panel">
            {messages.length === 0 ? (
              <div className="welcome-content">
                <p className="eyebrow">YOUR BANKING AGENT</p>
                <h1>Good morning, {displayName}.</h1>
                <p className="intro">
                  I can help with your banking now. Insurance and investing only become part of the
                  conversation when you choose.
                </p>
                <div className="agent-note">
                  <span className="titan-mark">T</span>
                  {insight && proactivity !== "ask" ? (
                    <div>
                      <strong>Something coming up</strong>
                      <p>{insight.reply}</p>
                      <div className="insight-actions">
                        <button type="button" onClick={() => send("Yes, please do that.")}>
                          Yes, do it
                        </button>
                        <button type="button" onClick={() => send("Tell me more.")}>
                          Tell me more
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <strong>Let&apos;s start with what matters today.</strong>
                      <p>
                        I won&apos;t make personal suggestions until I understand your priorities and
                        permissions.
                      </p>
                    </div>
                  )}
                </div>
                <div className="starter-list" aria-label="Start with Titan">
                  {starters.map(({ label, prompt, icon: Icon }) => (
                    <button key={label} type="button" onClick={() => send(prompt)} className="starter-row">
                      <Icon size={21} />
                      <span>{label}</span>
                      <ChevronRight size={19} />
                    </button>
                  ))}
                </div>
                <div className="proactivity">
                  <div>
                    <p className="section-label">Choose how proactive I should be</p>
                    <p className="muted">You can change this later in Preferences.</p>
                  </div>
                  <div className="radio-group">
                    {[
                      ["important", "Important matters only"],
                      ["helpful", "Helpful opportunities"],
                      ["ask", "Only when I ask"],
                    ].map(([value, label]) => (
                      <label key={value} className="radio-option">
                        <input
                          type="radio"
                          name="proactivity"
                          value={value}
                          checked={proactivity === value}
                          onChange={() => setProactivity(value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="conversation" aria-live="polite">
                <div className="conversation-heading">
                  <span className="titan-mark">T</span>
                  <div>
                    <p className="section-label">Conversation with Titan</p>
                    <p className="muted">Every action requires your approval.</p>
                  </div>
                </div>
                {messages.map((message, index) => (
                  <div key={index} className="message-stack">
                    <MessageBubble role={message.role} content={message.content} />
                    {message.actions?.map((action) => (
                      <ConfirmCard
                        key={action.id}
                        summary={action.summary}
                        status={actionStatus[action.id] ?? "pending"}
                        onConfirm={() => resolveAction(action.id, "confirm")}
                        onCancel={() => resolveAction(action.id, "cancel")}
                      />
                    ))}
                  </div>
                ))}
                {loading && (
                  <div className="typing">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}

            <form
              className="composer-wrap"
              onSubmit={(event) => {
                event.preventDefault();
                send(input);
              }}
            >
              <label htmlFor="agent-input">Or tell me what you need</label>
              <div className="composer">
                <MicButton
                  onTranscript={sendVoice}
                  onError={(message) => addAssistant(message, undefined, false)}
                  disabled={loading}
                />
                <input
                  id="agent-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask Titan anything..."
                  maxLength={2000}
                />
                <button type="submit" disabled={loading || !input.trim()} aria-label="Send message">
                  <Send size={19} />
                </button>
              </div>
            </form>
          </section>

          <aside className="banking-panel">
            <div>
              <p className="eyebrow">CONNECTED BANKING</p>
              <h2>Your banking today</h2>
            </div>
            <div className="balance-list">
              <div className="balance-row">
                <span>Current account</span>
                <strong>{formatEUR(checking?.balance ?? 0)}</strong>
              </div>
              <div className="balance-row">
                <span>Savings</span>
                <strong>{formatEUR(savings?.balance ?? 0)}</strong>
              </div>
            </div>
            <section className="setup-section">
              <div className="setup-heading">
                <h3>Getting started</h3>
                <span>1 of 3</span>
              </div>
              <div className="progress">
                <span />
              </div>
              <ol className="setup-list">
                <li className="done">
                  <span>
                    <Check size={15} />
                  </span>
                  <div>
                    <strong>Banking connected</strong>
                    <p>Your accounts are ready.</p>
                  </div>
                </li>
                <li className="current">
                  <span>2</span>
                  <div>
                    <strong>Tell Titan your first goal</strong>
                    <p>Share what you want to achieve.</p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Choose optional services</strong>
                    <p>Enable them only when you are ready.</p>
                  </div>
                </li>
              </ol>
            </section>
            <section className="recent-section">
              <div className="setup-heading">
                <h3>Recent activity</h3>
                <button type="button" onClick={() => setActiveView("activity")}>
                  View all <ArrowRight size={15} />
                </button>
              </div>
              <ul>
                {transactions.slice(0, 3).map((transaction) => (
                  <li key={transaction.id}>
                    <span>{transaction.description}</span>
                    <strong className={Number(transaction.amount) > 0 ? "positive" : ""}>
                      {formatEUR(transaction.amount)}
                    </strong>
                  </li>
                ))}
                {transactions.length === 0 && <li className="empty-row">No transactions yet</li>}
              </ul>
            </section>
            <div className="permission-note">
              <Landmark size={19} />
              <p>
                <strong>Banking only for now.</strong> Insurance and investing are off until you enable them.
              </p>
            </div>
          </aside>
        </main>
      )}

      {activeView === "activity" && (
        <main className="workspace-layout">
          <section className="workspace-main">
            <div className="workspace-title">
              <p className="eyebrow">YOUR HISTORY</p>
              <h1>Activity</h1>
              <p>Transactions, approvals and permission changes will appear here.</p>
            </div>
            <div className="filter-tabs" role="tablist" aria-label="Activity filters">
              <button className="selected" type="button">
                All
              </button>
              <button type="button">Money</button>
              <button type="button">Titan actions</button>
              <button type="button">Permissions</button>
            </div>
            <div className="activity-list">
              <p className="list-date">RECENT</p>
              {transactions.map((transaction) => (
                <button
                  className={`activity-row ${selectedTransaction === transaction.id ? "selected" : ""}`}
                  key={transaction.id}
                  type="button"
                  onClick={() => setSelectedTransaction(transaction.id)}
                >
                  <span className="activity-icon">
                    <ReceiptText size={19} />
                  </span>
                  <span className="activity-copy">
                    <strong>{transaction.description}</strong>
                    <small>{transaction.category || "Banking"} · Completed</small>
                  </span>
                  <span className={Number(transaction.amount) > 0 ? "amount positive" : "amount"}>
                    {formatEUR(transaction.amount)}
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
              {transactions.length === 0 && (
                <div className="activity-empty">
                  <ReceiptText size={24} />
                  <strong>No activity yet</strong>
                  <p>Your transactions and Titan approvals will appear here.</p>
                </div>
              )}
            </div>
          </section>
          <aside className="workspace-aside">
            {selectedActivity ? (
              <>
                <div className="detail-heading">
                  <span className="activity-icon large">
                    <ReceiptText size={22} />
                  </span>
                  <div>
                    <p className="eyebrow">TRANSACTION DETAIL</p>
                    <h2>{selectedActivity.description}</h2>
                  </div>
                </div>
                <div className="detail-amount">
                  <span>Amount</span>
                  <strong className={Number(selectedActivity.amount) > 0 ? "positive" : ""}>
                    {formatEUR(selectedActivity.amount)}
                  </strong>
                </div>
                <dl className="detail-list">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span className="status-dot" />
                      Completed
                    </dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{selectedActivity.category || "Banking"}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>
                      {new Intl.DateTimeFormat("en-BE", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }).format(new Date(selectedActivity.booked_at))}
                    </dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>Current account</dd>
                  </div>
                </dl>
                <div className="audit-note">
                  <LockKeyhole size={19} />
                  <div>
                    <strong>Recorded securely</strong>
                    <p>Titan cannot edit completed transaction history.</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="detail-placeholder">
                <Info size={24} />
                <h2>Select an activity</h2>
                <p>Choose an item to see its details and audit information.</p>
              </div>
            )}
          </aside>
        </main>
      )}

      {activeView === "preferences" && (
        <main className="workspace-layout preferences-layout">
          <section className="workspace-main">
            <div className="workspace-title">
              <p className="eyebrow">YOUR CONTROLS</p>
              <h1>Preferences</h1>
              <p>Choose what Titan can help with and when it may speak up.</p>
            </div>
            <PreferenceSection
              title="Services"
              description="Optional areas remain off until you enable them."
            >
              <SettingRow title="Banking" description="Payments, balances, bills and savings">
                <Toggle checked={bankingEnabled} onChange={setBankingEnabled} label="Banking" />
              </SettingRow>
              <SettingRow title="Insurance" description="Control whether Titan may review relevant cover">
                <select
                  value={insuranceMode}
                  onChange={(event) => setInsuranceMode(event.target.value)}
                  aria-label="Insurance preference"
                >
                  <option value="off">Off</option>
                  <option value="ask">Ask me first</option>
                  <option value="on">Enabled</option>
                </select>
              </SettingRow>
              <SettingRow title="Investing" description="Investment education, plans and account help">
                <Toggle checked={investingEnabled} onChange={setInvestingEnabled} label="Investing" />
              </SettingRow>
            </PreferenceSection>

            <PreferenceSection title="Data permissions" description="Titan only uses the sources you allow.">
              <SettingRow
                title="Accounts and transactions"
                description="Balances, payments and spending patterns"
              >
                <Toggle
                  checked={permissions.accounts}
                  onChange={(value) => setPermissions((current) => ({ ...current, accounts: value }))}
                  label="Accounts and transactions"
                />
              </SettingRow>
              <SettingRow
                title="Goals and risk profile"
                description="Progress towards goals and suitable guidance"
              >
                <Toggle
                  checked={permissions.goals}
                  onChange={(value) => setPermissions((current) => ({ ...current, goals: value }))}
                  label="Goals and risk profile"
                />
              </SettingRow>
              <SettingRow title="Calendar" description="Events only; Titan cannot edit your calendar">
                <Toggle
                  checked={permissions.calendar}
                  onChange={(value) => setPermissions((current) => ({ ...current, calendar: value }))}
                  label="Calendar"
                />
              </SettingRow>
              <SettingRow title="Location" description="Nearby and travel context">
                <Toggle
                  checked={permissions.location}
                  onChange={(value) => setPermissions((current) => ({ ...current, location: value }))}
                  label="Location"
                />
              </SettingRow>
            </PreferenceSection>

            <PreferenceSection title="Proactivity" description="Choose when Titan may begin a conversation.">
              <div className="preference-radios">
                {[
                  [
                    "important",
                    "Important matters only",
                    "Potential fees, missed payments, unusual activity and expiring cover",
                  ],
                  [
                    "helpful",
                    "Helpful opportunities",
                    "Relevant ways to save or prepare, based on allowed data",
                  ],
                  ["ask", "Only when I ask", "Titan will never begin a suggestion"],
                ].map(([value, label, description]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="preference-proactivity"
                      checked={proactivity === value}
                      onChange={() => setProactivity(value)}
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </PreferenceSection>
          </section>
          <aside className="workspace-aside preference-summary">
            <div>
              <p className="eyebrow">CURRENT SETUP</p>
              <h2>How Titan will work</h2>
            </div>
            <dl className="summary-list">
              <div>
                <dt>Banking help</dt>
                <dd>{bankingEnabled ? "Active" : "Off"}</dd>
              </div>
              <div>
                <dt>Insurance</dt>
                <dd>
                  {insuranceMode === "ask"
                    ? "Ask permission first"
                    : insuranceMode === "on"
                      ? "Enabled"
                      : "Off"}
                </dd>
              </div>
              <div>
                <dt>Investing</dt>
                <dd>{investingEnabled ? "Enabled" : "Off"}</dd>
              </div>
              <div>
                <dt>Proactivity</dt>
                <dd>
                  {proactivity === "important"
                    ? "Important matters only"
                    : proactivity === "helpful"
                      ? "Helpful opportunities"
                      : "Only when I ask"}
                </dd>
              </div>
              <div>
                <dt>Every action</dt>
                <dd>Requires approval</dd>
              </div>
            </dl>
            <button
              className="primary-action"
              type="button"
              onClick={() => {
                setPreferencesSaved(true);
                window.setTimeout(() => setPreferencesSaved(false), 2500);
              }}
            >
              {preferencesSaved ? (
                <>
                  <Check size={18} /> Saved
                </>
              ) : (
                "Save preferences"
              )}
            </button>
            <button
              className="text-action"
              type="button"
              onClick={() => {
                setBankingEnabled(true);
                setInsuranceMode("ask");
                setInvestingEnabled(false);
                setPermissions({ accounts: true, goals: true, calendar: false, location: false });
                setProactivity("important");
              }}
            >
              Restore defaults
            </button>
            <div className="audit-note">
              <Settings2 size={19} />
              <div>
                <strong>You remain in control</strong>
                <p>Permission changes will later appear in Activity when persistence is connected.</p>
              </div>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}

function PreferenceSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="preference-section">
      <div className="preference-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={`toggle ${checked ? "on" : ""}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
