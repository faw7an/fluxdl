import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function useClipboardCapture(onCapture: (url: string) => void) {
  const lastCaptured = useRef<string>("");

  useEffect(() => {
    const handleFocus = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        
        const url = text.trim();
        
        // Prevent re-triggering the exact same URL infinitely
        if (url === lastCaptured.current) return;

        // Validate it's a well-formed URL
        let parsed: URL;
        try {
          parsed = new URL(url);
          if (!parsed.protocol.startsWith("http")) return;
        } catch {
          return; // Not a valid URL string
        }

        // Check if it's a known downloadable file type
        const pathname = parsed.pathname.toLowerCase();
        const ext = pathname.split(".").pop();
        const fileExts =[
          "zip", "rar", "7z", "tar", "gz", "xz", "bz2", 
          "iso", "img", "bin", "exe", "msi", "dmg", "pkg", 
          "deb", "rpm", "mp4", "mkv", "avi", "webm", 
          "mp3", "flac", "wav", "ogg", "pdf", "epub"
        ];

        // Trigger if it has a file extension, or explicitly looks like a download link
        const isDownloadLink = fileExts.includes(ext || "") || 
                                       pathname.includes("/download/") || 
                                       pathname.includes("/releases/download/");

        if (isDownloadLink) {
          lastCaptured.current = url;
          toast.info("Captured download link from clipboard", { duration: 2000 });
          onCapture(url);
        }

      } catch (err) {
        // Silently fail if clipboard permissions are denied by the OS/Webview
        console.debug("Clipboard read failed:", err);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [onCapture]);
}