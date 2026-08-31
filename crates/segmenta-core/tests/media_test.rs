use segmenta_core::media::{parse_m3u8, resolve_url, select_best_variant, HlsPlaylist};

#[test]
fn test_resolve_url_relative_and_absolute() {
    let base = "https://example.com/streams/live/playlist.m3u8";

    // Absolute URL
    assert_eq!(
        resolve_url(base, "https://cdn.example.com/segment1.ts"),
        "https://cdn.example.com/segment1.ts"
    );

    // Relative URL
    assert_eq!(
        resolve_url(base, "segment1.ts"),
        "https://example.com/streams/live/segment1.ts"
    );

    // Path starting with slash
    assert_eq!(
        resolve_url(base, "/other/segment1.ts"),
        "https://example.com/other/segment1.ts"
    );
}

#[test]
fn test_parse_m3u8_media_playlist() {
    let m3u8_content = r#"#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:9.009,
segment0.ts
#EXTINF:9.009,Title 1
segment1.ts
#EXTINF:3.003,
segment2.ts
#EXT-X-ENDLIST"#;

    let parsed = parse_m3u8(m3u8_content, "https://example.com/live/").unwrap();
    match parsed {
        HlsPlaylist::Media {
            target_duration,
            media_sequence,
            segments,
            is_endlist,
        } => {
            assert_eq!(target_duration, Some(10.0));
            assert_eq!(media_sequence, Some(0));
            assert!(is_endlist);
            assert_eq!(segments.len(), 3);
            assert_eq!(segments[0].duration, 9.009);
            assert_eq!(segments[0].url, "https://example.com/live/segment0.ts");
            assert_eq!(segments[1].title, Some("Title 1".to_string()));
            assert_eq!(segments[1].url, "https://example.com/live/segment1.ts");
            assert_eq!(segments[2].duration, 3.003);
            assert_eq!(segments[2].url, "https://example.com/live/segment2.ts");
        }
        HlsPlaylist::Master { .. } => panic!("Expected Media playlist"),
    }
}

#[test]
fn test_parse_m3u8_master_playlist_and_variant_selection() {
    let master_content = r#"#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=800x450,CODECS="avc1.4d401f,mp4a.40.2"
mid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
high.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=768000,RESOLUTION=640x360
low.m3u8"#;

    let parsed = parse_m3u8(master_content, "https://video.example.com/master.m3u8").unwrap();
    match parsed {
        HlsPlaylist::Master { variants } => {
            assert_eq!(variants.len(), 3);
            assert_eq!(variants[0].bandwidth, Some(1280000));
            assert_eq!(variants[0].resolution, Some("800x450".to_string()));
            assert_eq!(
                variants[0].codecs,
                Some("avc1.4d401f,mp4a.40.2".to_string())
            );
            assert_eq!(variants[0].url, "https://video.example.com/mid.m3u8");

            let best = select_best_variant(&variants).expect("Should have best variant");
            assert_eq!(best.bandwidth, Some(2560000));
            assert_eq!(best.url, "https://video.example.com/high.m3u8");
        }
        HlsPlaylist::Media { .. } => panic!("Expected Master playlist"),
    }
}

#[test]
fn test_parse_invalid_m3u8() {
    let invalid = "Just some random text without EXTM3U";
    let res = parse_m3u8(invalid, "https://example.com");
    assert!(res.is_err());
}
