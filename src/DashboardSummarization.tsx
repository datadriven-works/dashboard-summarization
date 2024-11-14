/*

MIT License

Copyright (c) 2023 Looker Data Sciences, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

import React, { useCallback, useContext, useEffect, useState } from "react";
import { ExtensionContext } from "@looker/extension-sdk-react";
import { Filters } from "@looker/extension-sdk";
import { GenerativeLogo, LandingPage } from "./components/LandingPage";
import { socket } from "./socket";
import MarkdownComponent from "./components/MarkdownComponent";
import useWorkspaceOauth from "./hooks/useWorkspaceOauth";
import { SummaryDataContext } from "./contexts/SummaryDataContext";
import useSlackOauth from "./hooks/useSlackOauth";

interface DashboardMetadata {
  dashboardFilters: Filters | undefined;
  dashboardId: string | undefined;
  queries: {
    id: any;
    fields: any;
    view: any;
    model: any;
    dynamic_fields?: any;
  }[];
  indexedFilters: {
    [key: string]: {
      dimension: string;
      explore: string;
      model: string;
    };
  };
}

interface Listener {
  field: string;
  dashboard_filter_name: string;
}

interface DataItem {
  listen: Listener[];
}

type DashboardFilters = { [key: string]: any };

export const DashboardSummarization: React.FC = () => {
  const { extensionSDK, tileHostData, core40SDK } =
    useContext(ExtensionContext);
  const { dashboardFilters, dashboardId } = tileHostData;
  const [dashboardMetadata, setDashboardMetadata] =
    useState<DashboardMetadata>();
  const [loadingDashboardMetadata, setLoadingDashboardMetadata] =
    useState<boolean>(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [refinedData, setRefinedData] = useState([]);
  const context = useContext(SummaryDataContext);
  if (!context) {
    throw new Error("SummaryDataContext must be used within a provider");
  }
  const {
    data,
    setData,
    formattedData,
    setFormattedData,
    info,
    setInfo,
    message,
    setMessage,
    setDashboardURL,
  } = context;

  const [loading, setLoading] = useState(false);
  const workspaceOauth = useWorkspaceOauth();
  const slackOauth = useSlackOauth();
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onConnect() {
      console.log("Connected!!");
      setIsConnected(true);
    }

    function onDisconnect(value: string) {
      console.log("Disconnected: ", value);
      setIsConnected(false);
    }

    function onFooEvent(value: string) {
      // need this conditional to make sure that headers aren't included in the li elements generated
      setData((previous) =>
        value.substring(0, 2).includes("#")
          ? [...previous, "\n", value]
          : [...previous, value]
      );
    }

    function onRefineEvent(value: string) {
      // need this conditional to make sure that headers aren't included in the li elements generated
      setRefinedData(JSON.parse(value));
      const ovelayElement = document.getElementById("overlay");
      if (ovelayElement) {
        ovelayElement.style.zIndex = "10";
        ovelayElement.style.opacity = "1";
      }
    }

    function onComplete(event: string) {
      console.log(event);
      !event.includes(`"key_points":`) && setFormattedData(event);
      // formattedString.substring(0,formattedString.lastIndexOf('```'))
      setLoading(false);
    }

    socket.connect();

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("my broadcast event", onFooEvent);
    socket.on("my refine event", onRefineEvent);
    socket.on("complete", onComplete);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("my broadcast event", onFooEvent);
      socket.off("my refine event", onRefineEvent);
      socket.off("complete", onComplete);
    };
  }, []);

  useEffect(() => {
    if (tileHostData.dashboardRunState === "RUNNING") {
      setData([]);
      setLoading(false);
    }
  }, [dashboardFilters]);

  const applyFilterToListeners = (
    data: DataItem[],
    filters: Filters,
    dashboardFilters: DashboardFilters
  ) => {
    if (dashboardFilters !== null) {
      const filterListeners = data.filter((item) => item.listen.length > 0);
      // loop through each filter listener

      filterListeners.forEach((filter) => {
        // loop through each individual listener and apply filter to query
        filter.listen.forEach((listener) => {
          filters[listener.field] =
            dashboardFilters[listener.dashboard_filter_name];
        });
      });

      return filters;
    }

    return {};
  };

  const fetchQueryMetadata = useCallback(async () => {
    if (dashboardId) {
      setLoadingDashboardMetadata(true);
      setMessage("Loading Dashboard Metadata");
      const { description } = await core40SDK.ok(
        core40SDK.dashboard(dashboardId, "description")
      );

      const queries = await core40SDK
        .ok(
          core40SDK.dashboard_dashboard_elements(
            dashboardId,
            "query,result_maker,note_text,title,query_id"
          )
        )
        .then((res) => {
          const queries = res
            // query checks looker query, result maker checks custom fields
            .filter((d) => d.query !== null || d.result_maker !== null)
            .map((data) => {
              const { query, note_text, title } = data;
              if (query !== null && query !== undefined) {
                const {
                  fields,
                  dynamic_fields,
                  view,
                  model,
                  filters,
                  pivots,
                  sorts,
                  limit,
                  column_limit,
                  row_total,
                  subtotals,
                } = query;
                const newFilters = applyFilterToListeners(
                  data.result_maker?.filterables as any,
                  filters || {},
                  dashboardFilters as any
                );
                return {
                  queryBody: {
                    fields,
                    dynamic_fields,
                    view,
                    model,
                    filters: newFilters,
                    pivots,
                    sorts,
                    limit,
                    column_limit,
                    row_total,
                    subtotals,
                  },
                  note_text,
                  title,
                };
              } else if (
                data.result_maker!.query !== null &&
                data.result_maker!.query !== undefined
              ) {
                const {
                  fields,
                  dynamic_fields,
                  view,
                  model,
                  filters,
                  pivots,
                  sorts,
                  limit,
                  column_limit,
                  row_total,
                  subtotals,
                } = data.result_maker!.query;
                const newFilters = applyFilterToListeners(
                  data.result_maker?.filterables as any,
                  filters || {},
                  dashboardFilters as any
                );
                return {
                  queryBody: {
                    fields,
                    dynamic_fields,
                    view,
                    model,
                    filters: newFilters,
                    pivots,
                    sorts,
                    limit,
                    column_limit,
                    row_total,
                    subtotals,
                  },
                  note_text,
                  title,
                };
                // return undefined if the query is a merge query (since there is no query id and the query has to be reconstructed)
              } else {
                return undefined;
              }
            });
          return queries;
        })
        .finally(() => {
          setLoadingDashboardMetadata(false);
          setMessage(
            "Loaded Dashboard Metadata. Click 'Summarize Dashboard' to Generate report summary."
          );
          extensionSDK.rendered();
        });
      if (!loadingDashboardMetadata) {
        await extensionSDK.localStorageSetItem(
          `${dashboardId}:${JSON.stringify(dashboardFilters)}`,
          JSON.stringify({
            dashboardFilters,
            dashboardId,
            queries,
            description,
          })
        );
        setDashboardMetadata({
          dashboardFilters,
          dashboardId,
          queries,
          description,
        });
      }
    }
  }, [dashboardId, dashboardFilters]);

  useEffect(() => {
    if (
      (message && message.includes("Loaded Dashboard Metadata")) ||
      message.includes("Google Chat") ||
      message.includes("Slack")
    ) {
      setTimeout(() => {
        setInfo(false);
      }, 1000);
    }
  }, [message]);

  useEffect(() => {
    async function fetchCachedMetadata() {
      return await extensionSDK.localStorageGetItem(
        `${tileHostData.dashboardId}:${JSON.stringify(
          tileHostData.dashboardFilters
        )}`
      );
    }
    fetchCachedMetadata().then((cachedMetadata) => {
      if (cachedMetadata !== null) {
        setDashboardURL(
          extensionSDK.lookerHostData?.hostUrl +
            "/embed/dashboards/" +
            tileHostData.dashboardId
        );
        setLoadingDashboardMetadata(false);
        setMessage(
          "Loaded Dashboard Metadata from cache. Click 'Summarize Dashboard' to Generate report summary."
        );
        setDashboardMetadata(JSON.parse(cachedMetadata || "{}"));
      } else if (tileHostData.dashboardRunState !== "UNKNOWN") {
        setDashboardURL(
          extensionSDK.lookerHostData?.hostUrl +
            "/embed/dashboards/" +
            tileHostData.dashboardId
        );
        fetchQueryMetadata();
      }
    });
  }, [fetchQueryMetadata]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [data]);

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      {refinedData.length > 0 ? (
        <div
          id={"overlay"}
          onClick={() => {
            const overlayElement = document.getElementById("overlay");
            if (overlayElement) {
              overlayElement.style.zIndex = "-10";
              overlayElement.style.opacity = "0";
            }
          }}
          style={{
            position: "absolute",
            alignContent: "center",
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            height: "100vh",
            width: "100vw",
            zIndex: 10,
            backgroundColor: "rgba(0, 0, 0, 0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            className="refineCard"
            style={{
              justifyContent: "space-between",
              height: "80%",
              width: "80%",
              flexDirection: "column",
              margin: "2rem",
              opacity: 1,
              overflowY: "scroll",
            }}
          >
            {refinedData.map((value, index) => (
              <div key={index}>
                <p style={{ fontWeight: "bold", fontSize: "1rem" }}>
                  {value["query_title"]}
                </p>
                <span style={{ opacity: "0.8" }}>
                  {(value["key_points"] as string[]).join("\n")}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <></>
      )}
      <div style={{ height: "100vh", position: "relative", zIndex: 1 }}>
        {message ? (
          <div
            style={{
              position: "absolute",
              zIndex: 1,
              top: info
                ? document.documentElement.scrollTop || document.body.scrollTop
                : -100,
              left: 0,
              marginBottom: "1rem",
              width: "100%",
              padding: "0.8rem",
              fontSize: "0.8rem",
              color: "rgb(0,8,2,0.8)",
              alignContent: "center",
              backgroundColor: "rgb(255, 100, 100,0.2)",
              backdropFilter: "blur(10px)",
            }}
          >
            {message}
          </div>
        ) : (
          <></>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-evenly",
            marginBottom: "1rem",
          }}
        >
          {!loading && data.length <= 0 ? (
            <div
              className="layout"
              style={{
                boxShadow: "0px",
                paddingBottom: "1.2rem",
                paddingTop: "1.2rem",
                height: "50%",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{ fontSize: "1.2rem", opacity: "1", width: "auto" }}
                >
                  Dashboard Summarization
                </span>
                <span
                  style={{ fontSize: "0.9rem", opacity: "0.8", width: "60%" }}
                >
                  Looker + Vertex AI
                </span>
              </div>
              <button
                className="button"
                style={{ lineHeight: "20px", padding: "6px 16px" }}
                disabled={loading || !socket.connected}
                onClick={() => {
                  setLoading(true);
                  socket.emit(
                    "my event",
                    JSON.stringify({
                      ...dashboardMetadata,
                      instance: extensionSDK.lookerHostData?.hostOrigin
                        ?.split("https://")[1]
                        .split(".")[0],
                    })
                  );
                }}
              >
                {loading ? "Generating" : "Generate"}{" "}
                <img
                  style={{ opacity: loading ? 0.2 : 1 }}
                  src="https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/summarize_auto/default/20px.svg"
                />
              </button>
            </div>
          ) : (
            <></>
          )}
        </div>
        <div
          style={{
            boxShadow: "0px",
            position: "fixed",
            bottom: "0px",
            height: "10vh",
            paddingRight: "1rem",
            paddingLeft: "1rem",
            zIndex: 1,
            backgroundColor: "white",
            width: "-webkit-fill-available",
          }}
        >
          {loading ? (
            <div className="loading-icon">
              <GenerativeLogo />
              <div className="loading-dot" />
            </div>
          ) : (
            <div className="layoutBottom">
              <span
                style={{
                  fontSize: "0.9rem",
                  opacity: !loading ? 0.8 : 0.2,
                  width: "30%",
                }}
              >
                {/* Actions */}
              </span>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  width: "70%",
                  opacity: !loading ? 1 : 0.2,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.9rem",
                      opacity: !loading ? 0.8 : 0.2,
                      paddingRight: "0.8rem",
                    }}
                  >
                    Export
                  </span>
                  <button
                    disabled={loading || data.length <= 0}
                    onClick={workspaceOauth}
                    className="button"
                    style={{ borderRadius: "50%", padding: "0.5rem" }}
                  >
                    <img
                      height={20}
                      width={20}
                      src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Google_Chat_icon_%282020%29.svg/1024px-Google_Chat_icon_%282020%29.svg.png"
                    />
                  </button>
                  <button
                    disabled={loading || data.length <= 0}
                    onClick={slackOauth}
                    className="button"
                    style={{
                      borderRadius: "50%",
                      padding: "0.5rem",
                      marginLeft: "2vw",
                    }}
                  >
                    <img
                      height={20}
                      width={20}
                      src="https://cdn.worldvectorlogo.com/logos/slack-new-logo.svg"
                    />
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    marginLeft: "1rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.9rem",
                      opacity: !loading ? 0.8 : 0.2,
                      paddingRight: "0.8rem",
                      display: "none",
                    }}
                  >
                    Edit
                  </span>
                  <button
                    disabled={loading || data.length <= 0}
                    onClick={() => {
                      const summaryText = data.join("\n");
                      setLoading(true);
                      socket.emit("refine", JSON.stringify(summaryText));
                    }}
                    className="button"
                    style={{ borderRadius: "20%", padding: "0.5rem" }}
                  >
                    Refine
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {data.length > 0 ? (
          <div
            style={{
              height: "90%",
              marginBottom: "1rem",
              paddingLeft: "1rem",
            }}
          >
            <div className="summary-scroll" ref={containerRef}>
              <div className="progress"></div>
              <MarkdownComponent data={data} />
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              height: loading ? "70vh" : "90%",
              padding: "0.8rem",
              marginTop: "1rem",
              width: "100%",
            }}
          >
            {loading && data.length <= 0 ? (
              <div className="skeleton-bar"></div>
            ) : (
              <LandingPage />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
