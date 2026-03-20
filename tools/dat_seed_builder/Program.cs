using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using ImgTools;

class Program
{
    static readonly Regex BaseDefaultCodeRegex = new(@"^[mf][hb]00000$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    record Row(
        uint SourceAvatarId,
        uint? SourceRefId,
        string AvatarCode,
        string Name,
        string Slot,
        string Gender,
        int MinRank,
        int Note,
        int GoldWeek,
        int GoldMonth,
        int GoldPerm,
        int CashWeek,
        int CashMonth,
        int CashPerm,
        int StatPop,
        int StatTime,
        int StatAtk,
        int StatDef,
        int StatLife,
        int StatItem,
        int StatDig,
        int StatShld,
        string? SetKey,
        long? RemoveTime,
        int IsUnlocked,
        int Enabled
    );

    static string Esc(string s) => s.Replace("\\", "\\\\").Replace("'", "\\'");
    static string Sql(string? s) => s == null ? "NULL" : $"'{Esc(s)}'";

    static bool IsDefaultNakedBase(string slot, uint? sourceRefId, string avatarCode)
    {
        if (sourceRefId.GetValueOrDefault() != 0) return false;
        if (!string.Equals(slot, "head", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(slot, "body", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return BaseDefaultCodeRegex.IsMatch(avatarCode ?? "");
    }

    static byte[] DecodeBase(byte[] rec)
    {
        int clen = rec[0];
        var comp = new byte[clen];
        Buffer.BlockCopy(rec, 3, comp, 0, clen);
        int produced = 0;
        var outBuf = Compression.Decompress(comp, comp.Length, 0x94, ref produced).Take(produced).ToArray();
        if (outBuf.Length < 0x94) throw new Exception($"base short decode {outBuf.Length}");
        if (outBuf.Length > 0x94) outBuf = outBuf.Take(0x94).ToArray();
        return outBuf;
    }

    static byte[] DecodeEx(byte[] rec)
    {
        int clen = rec[0];
        var comp = new byte[clen];
        Buffer.BlockCopy(rec, 1, comp, 0, clen);
        int produced = 0;
        var outBuf = Compression.Decompress(comp, comp.Length, 512, ref produced).Take(produced).ToArray();
        return outBuf;
    }

    static string CStr(byte[] d, int off, int len)
    {
        if (off >= d.Length) return "";
        int e = off;
        int m = Math.Min(d.Length, off + len);
        while (e < m && d[e] != 0) e++;
        return Encoding.ASCII.GetString(d, off, e - off).Trim();
    }

    static bool LooksLikeName(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return false;
        if (!s.Any(char.IsLetter)) return false;
        if (s.Count(ch => ch == '?') > s.Length / 3) return false;
        return true;
    }

    static int Main(string[] args)
    {
        var datRoot = args.Length > 0 ? args[0] : @"C:\tools\dat files";
        var outPath = args.Length > 1 ? args[1] : @"C:\GBTH-NodeJS\server\sql\avatars_seed.sql";

        if (!Directory.Exists(datRoot))
        {
            Console.Error.WriteLine($"DAT directory not found: {datRoot}");
            return 1;
        }

        var rows = new List<Row>();
        var baseFiles = new (string File, string Slot, string Gender, string Prefix)[] {
            ("mb.dat","body","m","mb"),
            ("mh.dat","head","m","mh"),
            ("mg.dat","eyes","m","mg"),
            ("mf.dat","flag","m","mf"),
            ("fb.dat","body","f","fb"),
            ("fh.dat","head","f","fh"),
            ("fg.dat","eyes","f","fg")
        };

        foreach (var spec in baseFiles)
        {
            var path = Path.Combine(datRoot, spec.File);
            if (!File.Exists(path))
            {
                Console.Error.WriteLine($"Missing DAT file: {path}");
                return 2;
            }

            var data = File.ReadAllBytes(path);
            int count = BitConverter.ToInt32(data, 0);
            int rec = (data.Length - 4) / count;

            for (int i = 0; i < count; i++)
            {
                var rb = new byte[rec];
                Buffer.BlockCopy(data, 4 + i * rec, rb, 0, rec);
                var d = DecodeBase(rb);

                uint id = BitConverter.ToUInt32(d, 0x00);
                uint refId = BitConverter.ToUInt32(d, 0x04);
                string code = spec.Prefix + refId.ToString("D5");
                string name = CStr(d, 0x0C, 24);
                if (string.IsNullOrWhiteSpace(name)) name = code;

                int gold = BitConverter.ToInt32(d, 0x28);
                int cash = BitConverter.ToInt32(d, 0x2C);

                int[] s = new int[8];
                for (int si = 0; si < 8; si++) s[si] = BitConverter.ToInt32(d, 0x34 + si * 4);

                var enabled = IsDefaultNakedBase(spec.Slot, refId, code) ? 0 : 1;
                rows.Add(new Row(
                    id,
                    refId,
                    code,
                    name,
                    spec.Slot,
                    spec.Gender,
                    0,
                    0,
                    0,
                    0,
                    Math.Max(0, gold),
                    0,
                    0,
                    Math.Max(0, cash),
                    s[0],
                    s[1],
                    s[2],
                    s[3],
                    s[4],
                    s[5],
                    s[6],
                    s[7],
                    null,
                    null,
                    d[0x23] == 0 ? 0 : 1,
                    enabled
                ));
            }
        }

        foreach (var exFile in new[] { "ex1.dat", "ex2.dat" })
        {
            var path = Path.Combine(datRoot, exFile);
            if (!File.Exists(path)) continue;

            var data = File.ReadAllBytes(path);
            int count = BitConverter.ToInt32(data, 0);
            if (count <= 0) continue;
            int rec = (data.Length - 4) / count;

            for (int i = 0; i < count; i++)
            {
                var rb = new byte[rec];
                Buffer.BlockCopy(data, 4 + i * rec, rb, 0, rec);
                var d = DecodeEx(rb);
                if (d.Length < 0x3C) continue;

                uint id = BitConverter.ToUInt32(d, 0x00);
                uint refId = BitConverter.ToUInt32(d, 0x08);
                string name = CStr(d, 0x14, 40);
                if (!LooksLikeName(name)) continue;

                int gold = d.Length >= 0x34 ? BitConverter.ToInt32(d, 0x30) : 0;
                int cash = d.Length >= 0x38 ? BitConverter.ToInt32(d, 0x34) : 0;

                string slot = "exitem";
                if (exFile == "ex2.dat" && !name.Contains("Power User", StringComparison.OrdinalIgnoreCase))
                {
                    slot = "background";
                }

                string gender = "u";
                if (name.Contains("(M)", StringComparison.OrdinalIgnoreCase)) gender = "m";
                else if (name.Contains("(F)", StringComparison.OrdinalIgnoreCase)) gender = "f";

                int goldWeek = 0, goldMonth = 0, goldPerm = Math.Max(0, gold);
                int cashWeek = 0, cashMonth = 0, cashPerm = Math.Max(0, cash);

                if (name.Contains("Power User", StringComparison.OrdinalIgnoreCase))
                {
                    goldPerm = 0;
                    cashPerm = 0;
                    if (name.Contains("mth", StringComparison.OrdinalIgnoreCase))
                    {
                        goldMonth = Math.Max(0, gold);
                        cashMonth = Math.Max(0, cash);
                    }
                    else
                    {
                        goldWeek = Math.Max(0, gold);
                        cashWeek = Math.Max(0, cash);
                    }
                }

                string code = $"{Path.GetFileNameWithoutExtension(exFile)}_{id}";

                rows.Add(new Row(
                    id,
                    refId,
                    code,
                    name,
                    slot,
                    gender,
                    0,
                    0,
                    goldWeek,
                    goldMonth,
                    goldPerm,
                    cashWeek,
                    cashMonth,
                    cashPerm,
                    0, 0, 0, 0, 0, 0, 0, 0,
                    null,
                    null,
                    1,
                    1
                ));
            }
        }

        var dedup = rows
            .GroupBy(r => $"{r.SourceAvatarId}|{r.AvatarCode}|{r.Slot}|{r.Gender}")
            .Select(g => g.First())
            .OrderBy(r => r.AvatarCode, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.Gender, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.Slot, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.SourceAvatarId)
            .ToList();

        var cols = new[] {
            "source_avatar_id","source_ref_id","avatar_code","name","slot","gender","min_rank","note",
            "gold_week","gold_month","gold_perm","cash_week","cash_month","cash_perm",
            "stat_pop","stat_time","stat_atk","stat_def","stat_life","stat_item","stat_dig","stat_shld",
            "set_key","remove_time","is_unlocked","enabled"
        };

        var sb = new StringBuilder();
        sb.AppendLine("-- Auto-generated from DAT files via tools/dat_seed_builder");
        sb.AppendLine($"-- DAT source: {datRoot}");
        sb.AppendLine("START TRANSACTION;");
        sb.AppendLine("DELETE FROM avatars;");

        int chunk = 400;
        for (int i = 0; i < dedup.Count; i += chunk)
        {
            var part = dedup.Skip(i).Take(chunk).ToList();
            sb.AppendLine($"INSERT INTO avatars ({string.Join(", ", cols)}) VALUES");
            for (int j = 0; j < part.Count; j++)
            {
                var r = part[j];
                var values = new string[] {
                    r.SourceAvatarId.ToString(),
                    r.SourceRefId.HasValue ? r.SourceRefId.Value.ToString() : "NULL",
                    Sql(r.AvatarCode),
                    Sql(r.Name),
                    Sql(r.Slot),
                    Sql(r.Gender),
                    r.MinRank.ToString(),
                    r.Note.ToString(),
                    r.GoldWeek.ToString(),
                    r.GoldMonth.ToString(),
                    r.GoldPerm.ToString(),
                    r.CashWeek.ToString(),
                    r.CashMonth.ToString(),
                    r.CashPerm.ToString(),
                    r.StatPop.ToString(),
                    r.StatTime.ToString(),
                    r.StatAtk.ToString(),
                    r.StatDef.ToString(),
                    r.StatLife.ToString(),
                    r.StatItem.ToString(),
                    r.StatDig.ToString(),
                    r.StatShld.ToString(),
                    Sql(r.SetKey),
                    r.RemoveTime.HasValue ? r.RemoveTime.Value.ToString() : "NULL",
                    r.IsUnlocked.ToString(),
                    r.Enabled.ToString()
                };
                string suffix = (j == part.Count - 1) ? ";" : ",";
                sb.AppendLine($"({string.Join(", ", values)}){suffix}");
            }
        }

        sb.AppendLine("COMMIT;");
        Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
        File.WriteAllText(outPath, sb.ToString(), Encoding.UTF8);

        Console.WriteLine($"Wrote {dedup.Count} rows to {outPath}");
        return 0;
    }
}
