import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocalStorage } from "usehooks-ts";

const emailServiceUrl = import.meta.env.VITE_EMAIL_SERVICE_URL;

// Path to your local fallback .eml file in the public folder
// Place your pre-signed .eml file at: email_recovery/vlayer/public/fallback-email.eml
const FALLBACK_EML_PATH = "/fallback-email.eml";
const MAX_REMOTE_FAILURES = 2;

const useExampleInbox = (emailId: string | undefined) => {
  const [emlFetched, setEmlFetched] = useState(false);
  const [, setEmlFile] = useLocalStorage("emlFile", "");
  const [useFallback, setUseFallback] = useState(false);
  const failureCountRef = useRef(0);

  console.log("emailServiceUrl", emailServiceUrl);
  console.log("useFallback", useFallback);

  // Query for remote email service
  const {
    data: remoteData,
    status: remoteStatus,
    failureCount,
  } = useQuery({
    queryKey: ["receivedEmailEmlContent", emailId],
    queryFn: async () => {
      const response = await fetch(`${emailServiceUrl}/${emailId}.eml`);
      if (!response.ok) {
        throw new Error("Failed to fetch email from remote service");
      }
      return response.text();
    },
    enabled: !!emailId && !useFallback,
    retry: MAX_REMOTE_FAILURES,
    retryDelay: 10000, // 10 sec delay between fetch retries
  });

  // Track failures and switch to fallback after MAX_REMOTE_FAILURES
  useEffect(() => {
    if (failureCount > failureCountRef.current) {
      failureCountRef.current = failureCount;
      console.log(
        `Remote email fetch failed (attempt ${failureCount}/${MAX_REMOTE_FAILURES})`
      );

      if (failureCount >= MAX_REMOTE_FAILURES) {
        console.log("Switching to local fallback .eml file...");
        setUseFallback(true);
      }
    }
  }, [failureCount]);

  // Query for local fallback .eml file
  const { data: fallbackData, status: fallbackStatus } = useQuery({
    queryKey: ["fallbackEmailEmlContent"],
    queryFn: async () => {
      console.log("Fetching fallback .eml from:", FALLBACK_EML_PATH);
      const response = await fetch(FALLBACK_EML_PATH);
      if (!response.ok) {
        throw new Error(
          "Failed to fetch fallback .eml file. Make sure fallback-email.eml exists in the public folder."
        );
      }
      return response.text();
    },
    enabled: useFallback,
    retry: 1,
  });

  // Handle remote success
  useEffect(() => {
    if (remoteData && remoteStatus === "success") {
      console.log("Successfully fetched email from remote service");
      setEmlFile(remoteData);
      setEmlFetched(true);
    }
  }, [remoteData, remoteStatus, setEmlFile]);

  // Handle fallback success
  useEffect(() => {
    if (fallbackData && fallbackStatus === "success") {
      console.log("Successfully loaded fallback .eml file");
      setEmlFile(fallbackData);
      setEmlFetched(true);
    }
  }, [fallbackData, fallbackStatus, setEmlFile]);

  return { emlFetched, useFallback };
};

export default useExampleInbox;
