import App from "@/components/App";
import MotionProvider from "@/components/MotionProvider";

export default function Page() {
  return (
    <MotionProvider>
      <App />
    </MotionProvider>
  );
}
