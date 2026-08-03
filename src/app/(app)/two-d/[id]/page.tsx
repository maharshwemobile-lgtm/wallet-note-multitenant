import LotterySessionDetail from "@/components/LotterySessionDetail";

// 2D and 3D share one detail component. Each game keeps its own route so a 2D session does
// not open under a /three-d URL with "3D Records" highlighted in the nav.
export default LotterySessionDetail;
