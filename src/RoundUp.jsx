import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase, supabaseConfigured, fetchGroup, createGroupRow, updateGroupRow, subscribeToGroup } from "./supabaseClient.js";

// ---------- helpers ----------
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["S","M","T","W","T","F","S"];
const AVATAR_COLORS = ["#1F4B4A","#E8743B","#A8C4A2","#D4A373","#7FA89F","#C97064","#4A7155","#B5723F"];

function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function colorForName(name, friends) {
  const idx = friends.findIndex(f => f === name);
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function randomCode() {
  const words = ["MAPLE","RIVER","CORAL","PEAK","ORBIT","FERN","COVE","ECHO","ZEST","GLOW"];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return `${w}${n}`;
}

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, muted: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, muted: false });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length, muted: true, trailing: true });
  }
  // pad trailing with correct sequential numbers
  let trailCount = 1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].trailing) {
      cells[i].day = trailCount++;
    }
  }
  return cells;
}

// ---------- main component ----------
export default function RoundUp() {
  const [stage, setStage] = useState("loading"); // loading | landing | group | misconfigured
  const [groupCode, setGroupCode] = useState(null);
  const [groupData, setGroupData] = useState(null); // {name, friends: [], availability: {dateKey: [names]}}
  const [activeFriend, setActiveFriend] = useState(null);
  const [viewMonthOffset, setViewMonthOffset] = useState(0); // 0 = current month, 1 = next month
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [addFriendInput, setAddFriendInput] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [toast, setToast] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [longPressDate, setLongPressDate] = useState(null); // dateKey of open names modal (mobile)
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);

  const today = useMemo(() => new Date(), []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 860);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Fail fast with a clear message if Supabase env vars weren't set at build time.
  useEffect(() => {
    if (!supabaseConfigured) {
      setStage("misconfigured");
    }
  }, []);

  // restore last visited group from this browser's local storage (per-device, not shared)
  useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      try {
        const lastCode = localStorage.getItem("roundup-last-group");
        const lastFriend = localStorage.getItem("roundup-last-friend");
        if (lastCode) {
          const data = await fetchGroup(lastCode);
          if (data) {
            setGroupCode(lastCode);
            setGroupData(data);
            if (lastFriend && data.friends.includes(lastFriend)) {
              setActiveFriend(lastFriend);
            }
            setStage("group");
            return;
          }
        }
      } catch (e) {
        // fall through to landing
      }
      setStage("landing");
    })();
  }, []);

  // Subscribe to realtime changes for the active group so all devices stay in sync.
  useEffect(() => {
    if (!groupCode || !supabaseConfigured) return;
    const unsubscribe = subscribeToGroup(groupCode, (freshData) => {
      setGroupData(freshData);
    });
    return unsubscribe;
  }, [groupCode]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  async function persistGroup(code, data) {
    setSaving(true);
    try {
      await updateGroupRow(code, data);
      return { ok: true };
    } catch (e) {
      const detail = e && e.message ? e.message : String(e);
      showToast(`Couldn't save: ${detail}`);
      return { ok: false, detail };
    } finally {
      setSaving(false);
    }
  }

  async function createGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      setErrorMsg("Give your group a name first.");
      return;
    }
    setErrorMsg(null);
    let code = randomCode();
    // ensure uniqueness (best-effort, low collision odds)
    try {
      const existing = await fetchGroup(code);
      if (existing) code = randomCode();
    } catch (e) {
      // not found is expected and fine
    }
    const data = { name: trimmed, friends: [], availability: {} };
    try {
      await createGroupRow(code, data);
    } catch (e) {
      setErrorMsg(`Couldn't create the group. Details: ${e.message || "unknown error"}`);
      return;
    }
    localStorage.setItem("roundup-last-group", code);
    setGroupCode(code);
    setGroupData(data);
    setStage("group");
    setShowAddFriend(true);
  }

  async function joinGroup() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      setErrorMsg("Enter a group code to continue.");
      return;
    }
    try {
      const data = await fetchGroup(code);
      if (!data) {
        setErrorMsg("That code didn't match a group. Double-check it with whoever shared it.");
        return;
      }
      setErrorMsg(null);
      setGroupCode(code);
      setGroupData(data);
      localStorage.setItem("roundup-last-group", code);
      setStage("group");
    } catch (e) {
      setErrorMsg("Couldn't reach the group. Check your connection and try again.");
    }
  }

  async function addFriendToGroup() {
    const trimmed = addFriendInput.trim();
    if (!trimmed) return;
    if (groupData.friends.includes(trimmed)) {
      showToast(`${trimmed} is already in this group.`);
      return;
    }
    const updated = { ...groupData, friends: [...groupData.friends, trimmed] };
    setGroupData(updated);
    setAddFriendInput("");
    await persistGroup(groupCode, updated);
  }

  async function removeFriend(name) {
    const updated = {
      ...groupData,
      friends: groupData.friends.filter(f => f !== name),
    };
    // also strip from availability
    const newAvail = {};
    for (const [k, names] of Object.entries(updated.availability)) {
      newAvail[k] = names.filter(n => n !== name);
    }
    updated.availability = newAvail;
    setGroupData(updated);
    if (activeFriend === name) setActiveFriend(null);
    await persistGroup(groupCode, updated);
  }

  function pickFriend(name) {
    setActiveFriend(name);
    localStorage.setItem("roundup-last-friend", name);
  }

  async function toggleDate(key) {
    if (!activeFriend) {
      showToast("Tap your name first.");
      return;
    }
    const current = groupData.availability[key] || [];
    const isFree = current.includes(activeFriend);
    const updatedNames = isFree
      ? current.filter(n => n !== activeFriend)
      : [...current, activeFriend];
    const updatedAvailability = { ...groupData.availability, [key]: updatedNames };
    const updated = { ...groupData, availability: updatedAvailability };
    setGroupData(updated);
    await persistGroup(groupCode, updated);
  }

  // Long-press (mobile) opens the full names modal for a date.
  function startLongPress(key, hasNames) {
    if (!hasNames) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setLongPressDate(key);
    }, 450);
  }
  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  // Wraps the date tap so a long-press release doesn't also toggle availability.
  function handleCellTap(key) {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    toggleDate(key);
  }

  function leaveGroup() {
    setGroupCode(null);
    setGroupData(null);
    setActiveFriend(null);
    setStage("landing");
    localStorage.removeItem("roundup-last-group");
    localStorage.removeItem("roundup-last-friend");
  }

  // ---------- derived calendar data ----------
  const viewDate = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + viewMonthOffset, 1);
    return d;
  }, [today, viewMonthOffset]);

  const grid = useMemo(() => buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth()), [viewDate]);

  const bestDates = useMemo(() => {
    if (!groupData || groupData.friends.length === 0) return { keys: [], count: 0 };
    let max = 0;
    const entries = Object.entries(groupData.availability).filter(([k]) => {
      const [y, m] = k.split("-").map(Number);
      return y === viewDate.getFullYear() && m === viewDate.getMonth() + 1;
    });
    for (const [, names] of entries) {
      if (names.length > max) max = names.length;
    }
    if (max === 0) return { keys: [], count: 0 };
    const keys = entries.filter(([, names]) => names.length === max).map(([k]) => k);
    return { keys, count: max };
  }, [groupData, viewDate]);

  const markedCount = groupData ? groupData.friends.filter(f =>
    Object.values(groupData.availability).some(names => names.includes(f))
  ).length : 0;

  // ---------- render ----------
  if (stage === "misconfigured") {
    return (
      <div style={styles.page}>
        <FontImports />
        <div style={styles.landingWrap}>
          <div style={styles.landingLogo}>🗓️ Round Up</div>
          <div style={styles.errorText}>
            This app isn't connected to a database yet. Set <b>VITE_SUPABASE_URL</b> and{" "}
            <b>VITE_SUPABASE_ANON_KEY</b> in your deployment's environment variables, then redeploy.
            See the included README for setup steps.
          </div>
        </div>
      </div>
    );
  }

  if (stage === "loading") {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.center, color: "#8B8378", fontFamily: "Inter, sans-serif" }}>Loading…</div>
        <FontImports />
      </div>
    );
  }

  if (stage === "landing") {
    return (
      <div style={styles.page}>
        <FontImports />
        <div style={styles.landingWrap}>
          <div style={styles.landingLogo}>🗓️ Round Up</div>
          <div style={styles.landingTag}>Find the date that works for everyone. No sign-up, just tap your name.</div>

          <div style={styles.landingCard}>
            <div style={styles.landingCardTitle}>Start a new group</div>
            <input
              style={styles.input}
              placeholder="Group name, e.g. Hiking Crew"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createGroup()}
            />
            <button style={styles.primaryBtn} onClick={createGroup}>Create group</button>
          </div>

          <div style={styles.orDivider}><span>or</span></div>

          <div style={styles.landingCard}>
            <div style={styles.landingCardTitle}>Join a group</div>
            <input
              style={styles.input}
              placeholder="Enter group code, e.g. CORAL482"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinGroup()}
            />
            <button style={styles.secondaryBtn} onClick={joinGroup}>Join group</button>
          </div>

          {errorMsg && <div style={styles.errorText}>{errorMsg}</div>}
        </div>
      </div>
    );
  }

  // group stage
  const monthLabel = `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`;

  return (
    <div style={styles.page}>
      <FontImports />
      <div style={{ ...styles.appShell, ...(isMobile ? styles.appShellMobile : {}) }}>
        {/* Sidebar / top bar */}
        <div style={{ ...styles.sidebar, ...(isMobile ? styles.sidebarMobile : {}) }}>
          <div style={styles.sidebarTop}>
            <div style={styles.logo}>🗓️ Round Up</div>
            <button style={styles.leaveBtn} onClick={leaveGroup} title="Leave group">⇠</button>
          </div>

          <div style={styles.groupNameBox}>
            <div style={styles.groupLabel}>Group</div>
            <div style={styles.groupName}>{groupData.name}</div>
            <div style={styles.groupCodeRow}>
              Code: <b>{groupCode}</b>
              <button
                style={styles.copyBtn}
                onClick={() => {
                  navigator.clipboard?.writeText(groupCode);
                  showToast("Code copied — send it to your friends.");
                }}
              >Copy</button>
            </div>
          </div>

          <div style={styles.whoLabel}>I am…</div>
          <div style={{ ...styles.friendList, ...(isMobile ? styles.friendListMobile : {}) }}>
            {groupData.friends.map((f) => (
              <div
                key={f}
                style={{
                  ...styles.friendChip,
                  ...(isMobile ? styles.friendChipMobile : {}),
                  ...(activeFriend === f ? styles.friendChipActive : {}),
                }}
                onClick={() => pickFriend(f)}
              >
                <div style={{ ...styles.avatar, background: colorForName(f, groupData.friends) }}>
                  {initials(f)}
                </div>
                <span style={styles.friendChipName}>{f}</span>
                <button
                  style={styles.removeFriendBtn}
                  onClick={(e) => { e.stopPropagation(); removeFriend(f); }}
                  title={`Remove ${f}`}
                >×</button>
              </div>
            ))}
            {groupData.friends.length === 0 && (
              <div style={styles.emptyFriends}>No one's here yet. Add the first name below.</div>
            )}
          </div>

          {showAddFriend ? (
            <div style={styles.addFriendForm}>
              <input
                style={styles.inputSmall}
                placeholder="Friend's name"
                value={addFriendInput}
                autoFocus
                onChange={(e) => setAddFriendInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addFriendToGroup();
                  if (e.key === "Escape") setShowAddFriend(false);
                }}
              />
              <button style={styles.primaryBtnSmall} onClick={addFriendToGroup}>Add</button>
            </div>
          ) : (
            <div style={styles.addFriendPrompt} onClick={() => setShowAddFriend(true)}>
              + Add a friend to this group
            </div>
          )}

          <div style={styles.inviteBox}>
            <b>Share this group</b>
            Send this code so friends can join — they just tap their name, no account needed.
          </div>
        </div>

        {/* Main */}
        <div style={{ ...styles.main, ...(isMobile ? styles.mainMobile : {}) }}>
          <div style={styles.topbar}>
            <div>
              <div style={{ ...styles.monthTitle, ...(isMobile ? styles.monthTitleMobile : {}) }}>{monthLabel}</div>
              <div style={styles.monthSub}>
                {groupData.name} · {markedCount} of {groupData.friends.length} have marked their availability
              </div>
            </div>
            <div style={styles.navArrows}>
              <button
                style={{ ...styles.navBtn, opacity: viewMonthOffset === 0 ? 0.4 : 1 }}
                onClick={() => setViewMonthOffset(0)}
                disabled={viewMonthOffset === 0}
              >‹</button>
              <button
                style={{ ...styles.navBtn, opacity: viewMonthOffset === 1 ? 0.4 : 1 }}
                onClick={() => setViewMonthOffset(1)}
                disabled={viewMonthOffset === 1}
              >›</button>
            </div>
          </div>

          {bestDates.count > 0 && (
            <div style={styles.banner}>
              <div style={styles.bannerDot} />
              <div style={styles.bannerText}>
                <b>Best match: {bestDates.keys.map(k => {
                  const [, m, d] = k.split("-").map(Number);
                  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
                }).join(", ")}</b>
                {" — "}
                {bestDates.count === groupData.friends.length
                  ? "everyone is free"
                  : `${bestDates.count} of ${groupData.friends.length} are free`}
              </div>
            </div>
          )}

          {!activeFriend && groupData.friends.length > 0 && (
            <div style={styles.pickHint}>👆 Tap your name in the list to start marking dates.</div>
          )}

          <div style={{ ...styles.calendar, ...(isMobile ? styles.calendarMobile : {}) }}>
            <div style={styles.weekdaysRow}>
              {WEEKDAYS.map((w, i) => <div key={i} style={styles.weekdayCell}>{w}</div>)}
            </div>
            <div style={{ ...styles.daysGrid, ...(isMobile ? styles.daysGridMobile : {}) }}>
              {grid.map((cell, idx) => {
                if (cell.muted) {
                  return <div key={idx} style={{ ...styles.dayCell, ...(isMobile ? styles.dayCellMobile : {}), ...styles.dayMuted }}><div style={styles.dayNum}>{cell.day}</div></div>;
                }
                const key = dateKey(viewDate.getFullYear(), viewDate.getMonth(), cell.day);
                const namesHere = groupData.availability[key] || [];
                const isBest = bestDates.keys.includes(key) && bestDates.count > 0;
                const isMine = activeFriend && namesHere.includes(activeFriend);

                let cellStyle = { ...styles.dayCell, ...(isMobile ? styles.dayCellMobile : {}) };
                if (isMine) cellStyle = { ...cellStyle, ...styles.dayMine };
                if (isBest) cellStyle = { ...cellStyle, ...styles.dayBest };

                // Mobile caps avatars at 3 (date + 3 quadrants); 4+ shows 2 faces + "+N".
                const mobileAvatars = namesHere.length <= 3 ? namesHere : namesHere.slice(0, 2);
                const overflowCount = namesHere.length > 3 ? namesHere.length - 2 : 0;

                return (
                  <div
                    key={idx}
                    style={cellStyle}
                    onClick={() => handleCellTap(key)}
                    onTouchStart={isMobile ? () => startLongPress(key, namesHere.length > 0) : undefined}
                    onTouchEnd={isMobile ? cancelLongPress : undefined}
                    onTouchMove={isMobile ? cancelLongPress : undefined}
                    onTouchCancel={isMobile ? cancelLongPress : undefined}
                    onContextMenu={isMobile ? (e) => e.preventDefault() : undefined}
                  >
                    {isBest && <div style={styles.bestBadge}>★</div>}
                    {isMobile ? (
                      <div style={styles.mobileCellGrid}>
                        <div style={{ ...styles.dayNum, ...styles.mobileDayNum, ...(isBest ? { color: "#E8743B" } : {}) }}>{cell.day}</div>
                        {mobileAvatars.map((n) => (
                          <div
                            key={n}
                            style={{ ...styles.avDot, ...styles.avDotMobile, background: colorForName(n, groupData.friends) }}
                          >{initials(n)}</div>
                        ))}
                        {overflowCount > 0 && (
                          <div
                            style={styles.overflowPill}
                            onClick={(e) => { e.stopPropagation(); setLongPressDate(key); }}
                          >+{overflowCount}</div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div style={{ ...styles.dayNum, ...(isBest ? { color: "#E8743B" } : {}) }}>{cell.day}</div>
                        <div style={styles.dotsRow}>
                          {namesHere.map((n) => (
                            <div
                              key={n}
                              style={{ ...styles.avDot, background: colorForName(n, groupData.friends) }}
                              title={n}
                            >{initials(n)}</div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={styles.legend}>
              <div style={styles.legendItem}><div style={{ ...styles.legendSwatch, background: "#FFF4EC", border: "2px solid #E8743B" }} /> Best overlap</div>
              <div style={styles.legendItem}><div style={{ ...styles.legendSwatch, background: "#F0F7EE", border: "1.5px solid #A8C4A2" }} /> You're free</div>
              <div style={styles.legendItem}><div style={{ ...styles.legendSwatch, background: "#FCFBF8", border: "1px solid #F1ECE2" }} /> Open date</div>
            </div>
          </div>

          {activeFriend && (
            <div style={styles.toggleHint}>
              👆 Tap any date to mark yourself free as <b>{activeFriend}</b>. Tap again to undo.
            </div>
          )}
        </div>
      </div>

      {longPressDate && (() => {
        const names = groupData.availability[longPressDate] || [];
        const [, m, d] = longPressDate.split("-").map(Number);
        const ordered = groupData.friends.filter(f => names.includes(f));
        return (
          <div style={styles.modalBackdrop} onClick={() => setLongPressDate(null)}>
            <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <div style={styles.modalTitle}>
                  Free on {MONTH_NAMES[m - 1].slice(0, 3)} {d}
                  <span style={styles.modalCount}>{ordered.length} {ordered.length === 1 ? "person" : "people"}</span>
                </div>
                <button style={styles.modalCloseBtn} onClick={() => setLongPressDate(null)} title="Close">×</button>
              </div>
              <div style={styles.modalList}>
                {ordered.map((n) => (
                  <div key={n} style={styles.modalNameRow}>
                    <div style={{ ...styles.avatar, background: colorForName(n, groupData.friends) }}>{initials(n)}</div>
                    <span>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {toast && <div style={styles.toast}>{toast}</div>}
      {saving && <div style={styles.savingIndicator}>Saving…</div>}
    </div>
  );
}

function FontImports() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      button { cursor: pointer; font-family: inherit; }
      input { font-family: inherit; }
      button:focus-visible, input:focus-visible, div[tabindex]:focus-visible {
        outline: 2px solid #1F4B4A;
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; animation: none !important; }
      }
    `}</style>
  );
}

// ---------- styles ----------
const styles = {
  page: {
    fontFamily: "Inter, sans-serif",
    background: "#FAF7F2",
    minHeight: "100vh",
    color: "#2B2823",
  },
  center: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" },

  // Landing
  landingWrap: {
    maxWidth: 420,
    margin: "0 auto",
    padding: "60px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
  },
  landingLogo: {
    fontFamily: "Fredoka, sans-serif",
    fontSize: 28,
    fontWeight: 600,
    color: "#1F4B4A",
    textAlign: "center",
    marginBottom: 8,
  },
  landingTag: {
    fontSize: 14,
    color: "#8B8378",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 1.5,
  },
  landingCard: {
    background: "white",
    border: "1px solid #EFE9DD",
    borderRadius: 16,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  landingCardTitle: {
    fontFamily: "Fredoka, sans-serif",
    fontWeight: 600,
    fontSize: 15,
    color: "#1F4B4A",
  },
  orDivider: {
    textAlign: "center",
    color: "#B5AC9C",
    fontSize: 12,
    margin: "18px 0",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 600,
  },
  input: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1.5px solid #E8E2D6",
    fontSize: 14,
    outline: "none",
    background: "#FCFBF8",
  },
  inputSmall: {
    padding: "9px 12px",
    borderRadius: 8,
    border: "1.5px solid #4A7672",
    fontSize: 13,
    outline: "none",
    background: "white",
    flex: 1,
  },
  primaryBtn: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "none",
    background: "#E8743B",
    color: "white",
    fontWeight: 600,
    fontSize: 14,
  },
  secondaryBtn: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1.5px solid #1F4B4A",
    background: "white",
    color: "#1F4B4A",
    fontWeight: 600,
    fontSize: 14,
  },
  primaryBtnSmall: {
    padding: "9px 14px",
    borderRadius: 8,
    border: "none",
    background: "#E8743B",
    color: "white",
    fontWeight: 600,
    fontSize: 13,
  },
  errorText: {
    marginTop: 16,
    color: "#C0392B",
    fontSize: 13,
    textAlign: "center",
    background: "#FDF1EE",
    padding: "10px 14px",
    borderRadius: 8,
  },

  // App shell
  appShell: {
    display: "flex",
    minHeight: "100vh",
  },
  appShellMobile: {
    flexDirection: "column",
    minHeight: "auto",
  },
  sidebar: {
    width: 280,
    background: "#1F4B4A",
    padding: "28px 22px",
    color: "#FAF7F2",
    flexShrink: 0,
  },
  sidebarMobile: {
    width: "100%",
    padding: "18px 16px",
  },
  sidebarTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    fontFamily: "Fredoka, sans-serif",
    fontSize: 19,
    fontWeight: 600,
  },
  leaveBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "none",
    color: "#D8E5E2",
    width: 30,
    height: 30,
    borderRadius: 8,
    fontSize: 14,
  },
  groupNameBox: {
    background: "#2A5F5C",
    borderRadius: 12,
    padding: "14px 14px",
    marginBottom: 26,
  },
  groupLabel: {
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#7FA89F",
    fontWeight: 700,
    marginBottom: 4,
  },
  groupName: {
    fontFamily: "Fredoka, sans-serif",
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 8,
  },
  groupCodeRow: {
    fontSize: 12.5,
    color: "#C9DCD9",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  copyBtn: {
    background: "rgba(255,255,255,0.12)",
    border: "none",
    color: "#FAF7F2",
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 6,
    fontWeight: 600,
  },
  whoLabel: {
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#7FA89F",
    marginBottom: 10,
    fontWeight: 700,
  },
  friendList: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    marginBottom: 16,
  },
  friendListMobile: {
    flexDirection: "row",
    overflowX: "auto",
    flexWrap: "nowrap",
    paddingBottom: 6,
    marginBottom: 12,
    gap: 8,
  },
  friendChip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 10,
    fontSize: 13.5,
    fontWeight: 500,
    cursor: "pointer",
    background: "rgba(255,255,255,0.06)",
    color: "#D8E5E2",
    position: "relative",
  },
  friendChipMobile: {
    flexShrink: 0,
    borderRadius: 20,
    padding: "8px 12px",
    whiteSpace: "nowrap",
  },
  friendChipActive: {
    background: "#E8743B",
    color: "white",
    fontWeight: 600,
  },
  friendChipName: { flex: 1 },
  removeFriendBtn: {
    background: "transparent",
    border: "none",
    color: "inherit",
    opacity: 0.6,
    fontSize: 15,
    lineHeight: 1,
    padding: "0 2px",
  },
  emptyFriends: {
    fontSize: 12.5,
    color: "#7FA89F",
    fontStyle: "italic",
    padding: "4px 2px",
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "Fredoka, sans-serif",
    flexShrink: 0,
    color: "white",
  },
  addFriendForm: {
    display: "flex",
    gap: 6,
    marginBottom: 24,
  },
  addFriendPrompt: {
    border: "1.5px dashed #4A7672",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12.5,
    color: "#7FA89F",
    textAlign: "center",
    marginBottom: 24,
    cursor: "pointer",
  },
  inviteBox: {
    background: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 13,
    fontSize: 11.5,
    color: "#A8C4A2",
    lineHeight: 1.5,
  },

  main: {
    flex: 1,
    padding: "32px 36px",
    minWidth: 0,
  },
  mainMobile: {
    padding: "18px 14px",
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
    flexWrap: "wrap",
    gap: 12,
  },
  monthTitle: {
    fontFamily: "Fredoka, sans-serif",
    fontSize: 26,
    fontWeight: 600,
    color: "#1F4B4A",
    marginBottom: 3,
  },
  monthTitleMobile: {
    fontSize: 21,
  },
  monthSub: { fontSize: 13, color: "#8B8378" },
  navArrows: { display: "flex", gap: 8 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "white",
    border: "1px solid #E8E2D6",
    fontSize: 15,
    color: "#1F4B4A",
  },
  banner: {
    background: "linear-gradient(90deg, #FCEADB, #FAF7F2)",
    border: "1.5px solid #E8743B",
    borderRadius: 14,
    padding: "13px 18px",
    marginBottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  bannerDot: { width: 9, height: 9, borderRadius: "50%", background: "#E8743B", flexShrink: 0 },
  bannerText: { fontSize: 13.5, color: "#5C5547" },
  pickHint: {
    background: "#FFF8EE",
    border: "1px solid #F3DFC0",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    color: "#8A6D3B",
    marginBottom: 18,
  },
  calendar: {
    background: "white",
    borderRadius: 18,
    padding: "20px 20px 16px",
    border: "1px solid #EFE9DD",
  },
  calendarMobile: {
    padding: "12px 10px 12px",
    borderRadius: 14,
  },
  weekdaysRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    marginBottom: 6,
  },
  weekdayCell: {
    textAlign: "center",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "#B5AC9C",
    padding: "6px 0",
  },
  daysGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 7,
  },
  daysGridMobile: {
    gap: 4,
  },
  dayCell: {
    aspectRatio: "1",
    borderRadius: 12,
    background: "#FCFBF8",
    border: "1px solid #F1ECE2",
    padding: 7,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    cursor: "pointer",
    minHeight: 60,
  },
  dayCellMobile: {
    borderRadius: 8,
    padding: 3,
    minHeight: 0,
  },
  dayMuted: { opacity: 0.3, cursor: "default" },
  dayNum: { fontSize: 12, fontWeight: 600, color: "#8B8378" },
  dayMine: { background: "#F0F7EE", border: "1.5px solid #A8C4A2" },
  dayBest: { background: "#FFF4EC", border: "2px solid #E8743B", boxShadow: "0 3px 10px rgba(232,116,59,0.15)" },
  bestBadge: {
    position: "absolute",
    top: -7,
    right: -5,
    background: "#E8743B",
    color: "white",
    fontSize: 9,
    width: 16,
    height: 16,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 3,
    marginTop: "auto",
  },
  avDot: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    fontSize: 8,
    fontWeight: 700,
    fontFamily: "Fredoka, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    border: "1.5px solid white",
  },
  avDotMobile: {
    width: 13,
    height: 13,
    fontSize: 6,
    border: "1px solid white",
  },
  mobileCellGrid: {
    flex: 1,
    width: "100%",
    height: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gridTemplateRows: "repeat(2, 1fr)",
    placeItems: "center",
    gap: 1,
  },
  mobileDayNum: {
    alignSelf: "start",
    justifySelf: "start",
  },
  overflowPill: {
    minWidth: 16,
    height: 13,
    padding: "0 3px",
    borderRadius: 7,
    background: "#1F4B4A",
    color: "white",
    fontSize: 7.5,
    fontWeight: 700,
    fontFamily: "Fredoka, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  legend: {
    display: "flex",
    gap: 18,
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid #F1ECE2",
    fontSize: 12,
    color: "#8B8378",
    flexWrap: "wrap",
  },
  legendItem: { display: "flex", alignItems: "center", gap: 7 },
  legendSwatch: { width: 13, height: 13, borderRadius: 4 },
  toggleHint: {
    marginTop: 16,
    background: "#F0F7EE",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 13,
    color: "#4A7155",
  },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1F4B4A",
    color: "white",
    padding: "10px 18px",
    borderRadius: 10,
    fontSize: 13,
    boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
    zIndex: 50,
  },
  savingIndicator: {
    position: "fixed",
    top: 16,
    right: 16,
    background: "rgba(31,75,74,0.9)",
    color: "white",
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 11,
    zIndex: 50,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(31,40,35,0.45)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 60,
    padding: 16,
  },
  modalCard: {
    background: "white",
    borderRadius: 18,
    padding: "18px 18px 20px",
    width: "100%",
    maxWidth: 360,
    maxHeight: "70vh",
    overflowY: "auto",
    boxShadow: "0 -6px 30px rgba(0,0,0,0.2)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: "Fredoka, sans-serif",
    fontSize: 17,
    fontWeight: 600,
    color: "#1F4B4A",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  modalCount: {
    fontFamily: "Inter, sans-serif",
    fontSize: 12,
    fontWeight: 500,
    color: "#8B8378",
  },
  modalCloseBtn: {
    background: "#F1ECE2",
    border: "none",
    color: "#5C5547",
    width: 30,
    height: 30,
    borderRadius: 8,
    fontSize: 18,
    lineHeight: 1,
    flexShrink: 0,
  },
  modalList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  modalNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 500,
    color: "#2B2823",
  },
};
