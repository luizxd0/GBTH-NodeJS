import java.util.LinkedHashMap;
import java.util.Map;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class trace_mobile_vtable_slots_full extends GhidraScript {
    @Override
    public void run() throws Exception {
        Map<String, String> mobileToVtable = new LinkedHashMap<>();
        mobileToVtable.put("tank1", "00560990");
        mobileToVtable.put("tank2", "00560a70");
        mobileToVtable.put("tank3", "00561014");
        mobileToVtable.put("tank4", "005609cc");
        mobileToVtable.put("tank5", "0055fee4");
        mobileToVtable.put("tank6", "00560d6c");
        mobileToVtable.put("tank7", "005608c4");
        mobileToVtable.put("tank8", "0056027c");
        mobileToVtable.put("tank9", "005607ac");
        mobileToVtable.put("tank10", "00560504");
        mobileToVtable.put("tank11", "00560fa8");
        mobileToVtable.put("tank12", "00560494");
        mobileToVtable.put("tank13", "00560f38");
        mobileToVtable.put("tank14", "005605f0");
        mobileToVtable.put("tank15", "005602a0");
        mobileToVtable.put("tank16", "0055fd7c");

        final int maxSlots = 24;
        for (Map.Entry<String, String> entry : mobileToVtable.entrySet()) {
            String mobile = entry.getKey();
            Address vtableAddr = toAddr(entry.getValue());
            println("=== " + mobile + " vtable @ " + vtableAddr + " ===");
            for (int i = 0; i < maxSlots; i++) {
                Address slotAddr = vtableAddr.add(i * 4L);
                int raw = getInt(slotAddr);
                long ptr = Integer.toUnsignedLong(raw);
                Address fnAddr = toAddr(ptr);
                Function f = getFunctionAt(fnAddr);
                if (f == null) f = getFunctionContaining(fnAddr);
                println("slot[" + i + "] = " + fnAddr + " -> " + (f == null ? "<none>" : f.getName()));
            }
        }
    }
}
