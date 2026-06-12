// =============================================================================
// Tablecast — Feature Roadmap
// Split-pane layout with collapsible TOC sidebar and checkbox-aware markdown.
// =============================================================================
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Map, Loader, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft } from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { getJsonAuthHeaders } from "../../utils/authHeaders";

marked.setOptions({ gfm: true, breaks: true });

function compileRoadmapMarkdown(text) {
  if (!text) return "";
  try {
    const rawHtml = marked.parse(text);
    return DOMPurify.sanitize(rawHtml, {
      ADD_TAGS: ["input"],
      ADD_ATTR: ["checked", "disabled"],
    });
  } catch (e) {
    console.error("[roadmap] Markdown parsing failed:", e);
    return DOMPurify.sanitize(text);
  }
}

function extractHeadings(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const headingEls = doc.querySelectorAll("h2, h3");
  const headings = [];
  headingEls.forEach((el, i) => {
    const id = `roadmap-h-${i}`;
    el.id = id;
    headings.push({
      id,
      level: parseInt(el.tagName[1], 10),
      text: el.textContent.replace(/\s+/g, " ").trim(),
    });
  });
  return headings;
}

function injectHeadingIds(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const headingEls = doc.querySelectorAll("h2, h3");
  headingEls.forEach((el, i) => {
    el.id = `roadmap-h-${i}`;
  });
  return doc.body.innerHTML;
}

function buildTocTree(headings) {
  const tree = [];
  let currentSection = null;
  headings.forEach((h) => {
    if (h.level === 2) {
      currentSection = { ...h, children: [] };
      tree.push(currentSection);
    } else if (h.level === 3 && currentSection) {
      currentSection.children.push(h);
    }
  });
  return tree;
}

export default function FeatureRoadmap({ user }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState({});
  const [activeHeading, setActiveHeading] = useState(null);
  const contentRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/features", {
          headers: getJsonAuthHeaders(user),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setContent(data.content || "");
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const compiledHtml = useMemo(() => {
    if (!content) return "";
    return compileRoadmapMarkdown(content);
  }, [content]);

  const annotatedHtml = useMemo(() => {
    if (!compiledHtml) return "";
    return injectHeadingIds(compiledHtml);
  }, [compiledHtml]);

  const tocTree = useMemo(() => {
    if (!compiledHtml) return [];
    return buildTocTree(extractHeadings(compiledHtml));
  }, [compiledHtml]);

  const headingList = useMemo(() => {
    if (!compiledHtml) return [];
    return extractHeadings(compiledHtml);
  }, [compiledHtml]);

  const tocInitialized = useRef(false);
  useEffect(() => {
    if (tocTree.length > 0 && !tocInitialized.current) {
      const initialExpanded = {};
      tocTree.forEach((section, i) => {
        initialExpanded[section.id] = i === 0;
      });
      setExpandedSections(initialExpanded);
      tocInitialized.current = true;
    }
  }, [tocTree]);

  useEffect(() => {
    if (!contentRef.current || headingList.length === 0) return;

    if (observerRef.current) observerRef.current.disconnect();

    const observedIds = new Set(headingList.map((h) => h.id));
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && observedIds.has(entry.target.id)) {
            setActiveHeading(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );

    const raf = requestAnimationFrame(() => {
      headingList.forEach((h) => {
        const el = contentRef.current.querySelector(`#${CSS.escape(h.id)}`);
        if (el) observerRef.current.observe(el);
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [annotatedHtml, headingList]);

  const scrollToHeading = useCallback((id) => {
    setActiveHeading(id);
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    const section = tocTree.find((s) => s.children.some((c) => c.id === id));
    if (section && expandedSections[section.id] !== true) {
      setExpandedSections((prev) => ({ ...prev, [section.id]: true }));
    }
  }, [expandedSections, tocTree]);

  const toggleSection = useCallback((sectionId) => {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);

  if (loading) {
    return (
      <div style={s.centerWrap}>
        <Loader size={20} style={s.spinner} />
        <span style={s.loadingText}>Loading roadmap...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.centerWrap}>
        <p style={s.errorText}>Failed to load: {error}</p>
      </div>
    );
  }

  return (
    <div style={s.wrapper}>
      <div style={s.headerRow}>
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          style={s.toggleBtn}
          className="touch-target"
          aria-label={sidebarOpen ? "Hide outline" : "Show outline"}
          title={sidebarOpen ? "Hide outline" : "Show outline"}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
        <Map size={18} color="var(--color-accent)" />
        <span style={s.headerTitle}>Feature Roadmap</span>
      </div>

      <div style={s.body}>
        {/* TOC Sidebar */}
        <div
          style={{
            ...s.sidebar,
            width: sidebarOpen ? "215px" : "0px",
            minWidth: sidebarOpen ? "215px" : "0px",
            borderRight: sidebarOpen ? "1px solid var(--color-border-light)" : "none",
            opacity: sidebarOpen ? 1 : 0,
            pointerEvents: sidebarOpen ? "auto" : "none",
          }}
          className="roadmap-sidebar"
        >
          <div style={s.sidebarScroll}>
            {tocTree.map((section) => {
              const isExpanded = expandedSections[section.id] === true;
              return (
                <div key={section.id} style={s.tocSection}>
                  <button
                    onClick={() => toggleSection(section.id)}
                    style={s.tocSectionBtn}
                    className="touch-target"
                  >
                    <span style={s.tocArrow}>
                      {isExpanded ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                    </span>
                    <span style={s.tocSectionText}>{section.text}</span>
                  </button>
                  {isExpanded &&
                    section.children.map((child) => {
                      const isActive = activeHeading === child.id;
                      return (
                        <button
                          key={child.id}
                          onClick={() => scrollToHeading(child.id)}
                          style={{
                            ...s.tocChildBtn,
                            background: isActive
                              ? "var(--color-accent-dim)"
                              : "transparent",
                            color: isActive
                              ? "var(--color-accent)"
                              : "var(--color-muted)",
                            fontWeight: isActive ? 600 : 400,
                          }}
                          className="touch-target"
                        >
                          <span style={s.tocChildBullet}>•</span>
                          <span style={s.tocChildText}>{child.text}</span>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className="wiki-content roadmap-content"
          style={s.roadmapBody}
          dangerouslySetInnerHTML={{ __html: annotatedHtml }}
        />
      </div>

      <style>{`
        .roadmap-content input[type="checkbox"] {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border: 2px solid var(--color-muted);
          border-radius: 3px;
          margin-right: 6px;
          vertical-align: middle;
          position: relative;
          cursor: default;
          flex-shrink: 0;
        }
        .roadmap-content input[type="checkbox"]:checked {
          background: var(--color-accent);
          border-color: var(--color-accent);
        }
        .roadmap-content input[type="checkbox"]:checked::after {
          content: "";
          position: absolute;
          left: 3px;
          top: 0px;
          width: 5px;
          height: 9px;
          border: solid #fff;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        .roadmap-content input[type="checkbox"]:disabled {
          opacity: 0.8;
        }
        .roadmap-content li {
          margin-left: 1rem;
        }
        .roadmap-content h2 {
          scroll-margin-top: 12px;
        }
        .roadmap-content h3 {
          scroll-margin-top: 12px;
        }
        .roadmap-content hr {
          border-color: rgba(255,255,255,0.06);
        }
      `}</style>
    </div>
  );
}

const s = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    flex: 1,
    overflow: "hidden",
    minHeight: 0,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0 0 0.5rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  toggleBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    cursor: "pointer",
    padding: "4px",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "36px",
    minHeight: "36px",
    transition: "color 0.15s",
  },
  headerTitle: {
    fontSize: "1rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
  },
  body: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    background: "rgba(0, 0, 0, 0.2)",
    overflow: "hidden",
    transition: "width 0.25s ease, min-width 0.25s ease, opacity 0.2s ease, border 0.25s ease",
    flexShrink: 0,
  },
  sidebarScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "0.5rem 0",
  },
  tocSection: {
    marginBottom: "0.15rem",
  },
  tocSectionBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    width: "100%",
    padding: "0.4rem 0.6rem",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
    cursor: "pointer",
    color: "var(--color-text)",
    fontSize: "0.73rem",
    fontWeight: 700,
    textAlign: "left",
    transition: "background 0.1s",
    minHeight: "36px",
  },
  tocArrow: {
    flexShrink: 0,
    color: "var(--color-accent)",
    display: "flex",
    alignItems: "center",
  },
  tocSectionText: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tocChildBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    width: "100%",
    padding: "0.3rem 0.6rem 0.3rem 1.6rem",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "0.68rem",
    textAlign: "left",
    transition: "all 0.1s",
    minHeight: "32px",
    lineHeight: 1.3,
  },
  tocChildBullet: {
    color: "var(--color-accent)",
    flexShrink: 0,
    fontSize: "0.55rem",
  },
  tocChildText: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  roadmapBody: {
    flex: 1,
    overflowY: "auto",
    padding: "0.5rem 0.75rem",
    fontSize: "0.82rem",
    lineHeight: "1.55",
    color: "var(--color-text)",
    minWidth: 0,
  },
  centerWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    padding: "3rem 1rem",
    flex: 1,
  },
  loadingText: {
    fontSize: "0.85rem",
    color: "var(--color-muted)",
  },
  errorText: {
    fontSize: "0.85rem",
    color: "var(--color-danger)",
  },
  spinner: {
    animation: "spin 1s linear infinite",
    color: "var(--color-accent)",
  },
};
