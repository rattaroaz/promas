//! Token search: every word in the query must appear, in any order.

/// True when `query` is blank, or every whitespace-separated word appears in
/// `haystack`. Matching is case-insensitive. Word order does not matter, so
/// `11334 Canyon` and `11334 Secco` both match `11334 W. Secco Canyon Hwy`.
pub fn matches_tokens(haystack: &str, query: &str) -> bool {
    let hay = haystack.to_lowercase();
    query.split_whitespace().all(|token| {
        let token = token.to_lowercase();
        !token.is_empty() && hay.contains(&token)
    })
}

pub fn register_search(conn: &rusqlite::Connection) -> Result<(), String> {
    use rusqlite::functions::FunctionFlags;
    conn.create_scalar_function(
        "promas_match",
        2,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let hay = ctx
                .get::<Option<String>>(0)
                .ok()
                .flatten()
                .unwrap_or_default();
            let query = ctx
                .get::<Option<String>>(1)
                .ok()
                .flatten()
                .unwrap_or_default();
            Ok(matches_tokens(&hay, &query))
        },
    )
    .map_err(|e| format!("search: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const STREET: &str = "11334 W. Secco Canyon Hwy";

    #[test]
    fn words_match_in_any_order_ignoring_case() {
        assert!(matches_tokens(STREET, "11334 Canyon"));
        assert!(matches_tokens(STREET, "11334 Secco"));
        assert!(matches_tokens(STREET, "canyon 11334"));
        assert!(matches_tokens(STREET, "SECCO hwy"));
    }

    #[test]
    fn a_missing_word_does_not_match() {
        assert!(!matches_tokens(STREET, "11334 Missing"));
        assert!(!matches_tokens(STREET, "Canyon Only"));
    }

    #[test]
    fn a_blank_query_matches_every_record() {
        assert!(matches_tokens(STREET, ""));
        assert!(matches_tokens(STREET, "   "));
        assert!(matches_tokens("", ""));
    }
}
