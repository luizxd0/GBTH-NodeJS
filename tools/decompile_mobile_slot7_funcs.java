import java.util.LinkedHashMap;
import java.util.Map;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class decompile_mobile_slot7_funcs extends GhidraScript {
    @Override
    public void run() throws Exception {
        Map<String, String> funcs = new LinkedHashMap<>();
        funcs.put("tank1_slot7", "004816c0");
        funcs.put("tank2_slot7", "00484bb0");
        funcs.put("tank3_slot7", "004a0810");
        funcs.put("tank4_slot7", "00481fe0");
        funcs.put("tank5_slot7", "00456e20");
        funcs.put("tank6_slot7", "00490880");
        funcs.put("tank7_slot7", "0047eee0");
        funcs.put("tank8_slot7", "00467d80");
        funcs.put("tank9_slot7", "0047aba0");
        funcs.put("tank10_slot7", "004730b0");
        funcs.put("tank11_slot7", "0049d4f0");
        funcs.put("tank12_slot7", "00470250");
        funcs.put("tank14_slot7", "00476e60");
        funcs.put("tank15_slot7", "00468340");
        funcs.put("tank16_slot7", "00451b80");
        funcs.put("tank13_related_a", "0049b8e0");
        funcs.put("tank13_related_b", "0049c080");

        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        for (Map.Entry<String, String> entry : funcs.entrySet()) {
            Address addr = toAddr(entry.getValue());
            Function f = getFunctionAt(addr);
            if (f == null) f = getFunctionContaining(addr);
            println("=== " + entry.getKey() + " @ " + addr + " => " + (f == null ? "<none>" : f.getName()) + " ===");
            if (f == null) continue;
            DecompileResults res = ifc.decompileFunction(f, 120, monitor);
            if (res != null && res.decompileCompleted()) {
                println(res.getDecompiledFunction().getC());
            } else {
                println("Decompile failed");
            }
        }
    }
}
