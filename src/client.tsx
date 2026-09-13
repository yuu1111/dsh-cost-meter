/**
 * ブラウザ側の本体
 *
 * シェルの統計ピルと同じ行へ 1つのピルを足す 金額はホスト側のセッション投影
 * `costMeter` が持つ値だけで 単価はここでは扱わない
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { breakdownText, formatAmount, PROJECTION_KEY } from "./shared.ts";

/**
 * ピルを置くドック
 *
 * シェルの統計ピルが並ぶ行と同じ場所 リスト枠なので追加できる
 */
const DOCK = "conversation.composer.dock";

/**
 * 統計ピルが並ぶ行の目印
 *
 * シェルが統計ピルの行に付ける属性 同じ行へ並ぶための描画先に使う
 */
const STATS_ROW_SELECTOR = "[data-composer-stats]";

/**
 * ピルの登録 id
 */
const PILL_ID = "cost";

/**
 * ピルの見た目
 *
 * 統計ピルの行へ入るときは行の字と間隔をそのまま使う 行が無いときだけ自前の
 * 行を描くため その行の組み方も同じ値で持つ シェルの CSS Modules は外から
 * 読めないので自前の style タグで配る
 */
const STYLE = `
.dsh-cost-meter{display:flex;justify-content:center;gap:12px;max-width:var(--dsh-chat-content-width);width:100%;margin:0 auto;box-sizing:border-box;padding:0 calc(var(--dsh-composer-side-clearance) + 16px);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}
.dsh-cost-meter-pill{display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;max-width:100%;padding:1px 8px;border-radius:24px;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap}
.dsh-cost-meter-pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dsh-cost-meter-symbol{flex:none;font-size:12px;font-weight:600;line-height:1}
.dsh-cost-meter-amount{min-width:0;overflow:hidden;text-overflow:ellipsis}
.dsh-cost-meter-unpriced{margin-left:1px;font-size:11px}
`;

/**
 * スタイルタグの識別子
 */
const STYLE_TAG_ID = "dsh-cost-meter/style.css";

/**
 * ピルが受け取る props
 *
 * セッション枠の標準 props から投影の読み口だけを使う
 */
type CostPillProps = PropsRuntime<typeof DOCK>;

/**
 * このプラグインが待つサービス
 *
 * 枠組みへの登録口そのものなので 無い構成では起動しない
 */
export const inject = ["slots"];

/**
 * 統計ピルの行を探して追う
 *
 * ドック内に置く目印から親をたどり その中に現れる行を描画先にする 行は
 * セッションの切り替えで作り直されるため 出入りを監視して追随する
 * @returns 目印の ref と 見つかった行 まだ無ければ null
 */
function useStatsRow(): {
	anchorRef: React.RefObject<HTMLSpanElement | null>;
	row: HTMLElement | null;
} {
	const anchorRef = useRef<HTMLSpanElement | null>(null);
	const [row, setRow] = useState<HTMLElement | null>(null);
	useEffect(() => {
		const container = anchorRef.current?.parentElement;
		if (container === undefined || container === null) return;
		const sync = () => {
			setRow((current) => {
				const next = container.querySelector<HTMLElement>(STATS_ROW_SELECTOR);
				return current === next ? current : next;
			});
		};
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(container, { childList: true, subtree: true });
		return () => {
			observer.disconnect();
		};
	}, []);
	return { anchorRef, row };
}

/**
 * 金額そのものを出すピル
 * @param props - 表示する金額
 * @returns ピル
 */
function CostPillBody({
	view,
}: {
	view: NonNullable<ReturnType<CostPillProps["useProjection"]>>;
}) {
	return (
		<Tooltip label={breakdownText(view)} side="top">
			<span className="dsh-cost-meter-pill" data-cost-meter>
				<span className="dsh-cost-meter-symbol" aria-hidden>
					{view.symbol}
				</span>
				<span className="dsh-cost-meter-amount">
					{formatAmount(view.total)}
				</span>
				{view.unpricedTokens > 0 && (
					<span className="dsh-cost-meter-unpriced" aria-hidden>
						+
					</span>
				)}
			</span>
		</Tooltip>
	);
}

/**
 * 今のセッションの累計金額を出すピル
 *
 * 統計ピルの行があればその中へ並べ 無ければ自前の行として描く
 * @param props - ドックが配る標準 props
 * @returns ピル 表示する金額が無ければ何も描かない
 */
function CostPill({ useProjection }: CostPillProps) {
	const view = useProjection(PROJECTION_KEY);
	const { anchorRef, row } = useStatsRow();
	const body =
		view === undefined || view.tokens === 0 ? null : (
			<CostPillBody view={view} />
		);
	return (
		<>
			<span ref={anchorRef} hidden />
			{body !== null &&
				(row === null ? (
					<div className="dsh-cost-meter">{body}</div>
				) : (
					createPortal(body, row)
				))}
		</>
	);
}

/**
 * 見た目のスタイルタグを document へ入れる
 * @returns 取り除く関数
 */
function installStyle(): () => void {
	const existing = document.getElementById(STYLE_TAG_ID);
	if (existing !== null) return () => undefined;
	const style = document.createElement("style");
	style.id = STYLE_TAG_ID;
	style.textContent = STYLE;
	document.head.append(style);
	return () => {
		style.remove();
	};
}

/**
 * 統計ドックへピルを登録する
 * @param ctx - クライアント側 cordis コンテキスト
 */
export function apply(ctx: Context): void {
	ctx.effect(installStyle, "cost-meter: pill style");
	// ドックが生まれるたびに登録し ドックが畳まれると一緒に消える
	ctx.slots.inject(DOCK, () =>
		ctx.slots.register(
			{
				name: DOCK,
				id: PILL_ID,
				// 統計ピル(order 0)の後ろへ並べる
				order: 10,
			},
			CostPill,
		),
	);
}
