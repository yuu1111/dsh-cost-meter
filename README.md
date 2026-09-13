# dsh-cost-meter

English | [日本語](README.ja.md)

Real-time spend for the DeepSeek Harness Web GUI: one pill under the composer,
beside the shipped turn/token pills, that says how much the session has cost so
far.

```
⏱ 1 turns 71 steps · 285 tok/s    🗄 7.3M tok · Cache hit 99%    $ 0.42
```

The amount rides the session projection seam, so it is whole-log (paging and
compaction cannot change it), it survives reloads, and it is priced from the
durable provider usage the harness already logs. Hovering the pill shows the
breakdown: input, output, cache, total, and the route that priced them.

## Install

```sh
dsh plugin --profile web add dsh-cost-meter
```

Under a source checkout, `add link:<path>` works the same way. The plugin
declares its own bundle patch, so the row appears in the profile without
editing `cordis.patch.yml`.

## Configure

Every field lives on the plugin row, and every price is per **one million
tokens** in whatever currency `symbol` names. Replace the numbers with the
rates your own provider actually bills.

```yaml
- id: cost-meter
  name: dsh-cost-meter
  config:
    symbol: '$'
    rates:
      opencode-go/deepseek-flash:
        input: 0.22
        output: 0.66
        cacheRead: 0.007
        cacheWrite: 0
      opencode-go/deepseek-v4-pro:
        input: 0.66
        output: 1.98
        cacheRead: 0.022
        cacheWrite: 0
```

| Field | Meaning |
|---|---|
| `symbol` | Prefixed to every amount. Default `$`. |
| `rates` | Unit prices keyed by `"<provider>/<model>"`, then `"<model>"`. The route key wins. |
| `fallback` | Unit prices for every route no key matches. Omit it to price nothing by default. |

A route with no matching rate is not guessed at: its tokens are counted as
**unpriced**, contribute nothing to the total, and make the pill mark its amount
with a trailing `+`. The tooltip then names how many tokens were left unpriced,
so a missing rate is visible instead of silently wrong.

## Where the numbers come from

The host half registers the `costMeter` session projection. It folds the
durable log: a `request/header` sets the route, and each settled
`assistant/message` (or `assistant/attempt`, which preserves a billed attempt
that left no surface message) contributes the provider usage embedded in its
stream. A re-reported sample for the same turn and step replaces the earlier
one; `llm/retry-started` closes that slot so a retried attempt adds instead.
Input, output, cache-read, and cache-write tokens are then priced by the route's
rates.

The client half registers one entry on the `conversation.composer.dock` slot
and renders it into the shipped stats row (`[data-composer-stats]`) with a React
portal, so the cost pill shares that row's font, spacing, and vertical rhythm
instead of starting a row of its own. Without a stats row to join (a session
that has produced no steps or tokens yet) it falls back to drawing its own
centered row.

## Caveats

- **Not a billing record.** The figures are the harness's own token accounting
  times the rates you configured. The provider's invoice is the authority; a
  wrong rate in `rates` is a wrong pill.
- **One rate per route.** A provider that changes its price mid-session, or a
  route whose price depends on the request size, needs a rate that reflects what
  you actually pay.
- **Currency is yours to name.** Nothing here converts between currencies.

## Development

```sh
bun install
bun run build     # lib/index.js (host half) and lib/client.js (browser half)
bun test          # pricing fold, formatting, and the built bundle
bun run check     # type check
```

`lib/` is generated and ignored by git. `build.ts` bundles the host half as ESM
(with `zod` and `@deepseek-ai/schemastery` left external) and the browser half
as CJS wrapped in the `window.__ModuleLoader__.load({ id, factory })` loader
format the client module system serves.

## License

MIT
